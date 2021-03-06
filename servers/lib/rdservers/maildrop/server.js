/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at:
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Mozilla Raindrop Code.
 *
 * The Initial Developer of the Original Code is
 *   The Mozilla Foundation
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Andrew Sutherland <asutherland@asutherland.org>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

/**
 * Maildrop message reception logic; receive one or more `MaildropTransitEnvelope`
 **/

define(
  [
    'q',
    'rdcommon/crypto/keyops',
    '../authdb/api',
    'rdcommon/log',
    'rdcommon/taskidiom', 'rdcommon/taskerrors',
    'module',
    'exports'
  ],
  function(
    $Q,
    $keyops,
    $auth_api,
    $log,
    $task, $taskerrors,
    $module,
    exports
  ) {
var when = $Q.when;

var AuthAPI = $auth_api;


var LOGFAB = exports.LOGFAB = $log.register($module, {
});


var taskMaster = $task.makeTaskMasterForModule($module, LOGFAB);

/**
 * The actual meat of delivery processing extracted out so that the sender API
 *  can fast-path messages from a user to their own server.  Currently we
 *  immediately initiate an asynchronous delivery/processing of the message,
 *  but in the future we might move to simply enqueueing the message.
 *
 * We do synchronously unbox the outer envelope and do not catch any crypto
 *  exceptions, so callers should be prepared.  Likewise, we will throw on a
 *  malformed message.
 *
 * @return[Task]
 */
var fauxPersonEnqueueProcessNow = exports.fauxPersonEnqueueProcessNow =
      function fauxPersonEnqueueProcessNow(config, outerEnvelope,
                                           otherServerKey, _logger) {

  var innerEnvelope = JSON.parse(
                        config.keyring.openBoxUtf8(outerEnvelope.innerEnvelope,
                                                   outerEnvelope.nonce,
                                                   outerEnvelope.senderKey));
  var arg = {
    config: config,
    outerEnvelope: outerEnvelope,
    innerEnvelope: innerEnvelope,
    otherServerKey: otherServerKey,
  };
  switch (innerEnvelope.type) {
    // - other user to user
    case "user":
      return new UserToUserMessageTask(arg, _logger).run();

    // - other user to user's maildrop
    case "joinconv":
      return new ConversationJoinTask(arg, _logger).run();

    // - (other) user to user's fanout role
    case "convadd":
      return new ConversationAddTask(arg, _logger).run();
    case "convmsg":
      return new ConversationMessageTask(arg, _logger).run();
    case "convmeta":
      return new ConversationMetaTask(arg, _logger).run();

    // - user to their own maildrop
    case "createconv":
      return new CreateConversationTask(arg, _logger).run();

    default:
      throw new $taskerrors.MalformedPayloadError(
                  "Bad inner envelope type '" + innerEnvelope.type + "'");
  }
};

/**
 * Server-to-server messages faux queued processing that instead actually
 *  happens now.  Does not throw.
 */
var fauxServerEnqueueProcessNow = exports.fauxServerEnqueueProcessNow =
    function fauxServerEnqueueProcessNow(config, envelope,
                                         otherServerKey, _logger) {
  var arg = {
    config: config,
    envelope: envelope,
    otherServerKey: otherServerKey,
  };
  switch (envelope.type) {
    case "joined":
      return new ConversationJoinedTask(arg, _logger).run();

    case "initialfan":
      return new InitialFanoutToUserMessageTask(arg, _logger).run();
    case "fannedmsg":
      return new FanoutToUserMessageTask(arg, _logger).run();
    default:
      throw new $taskerrors.MalformedPayloadError(
                  "Bad envelope type '" + envelope.type + "'");
  }
};

/**
 * The delivery conn receives inbound messages targeted at either users (in
 *  the guise of their mailstore) or daemons.  We operate within an authconn
 *  connection which means that we know we are talking to the server we think
 *  we are talking to, not that the server speaks with the same authority as
 *  one of its users.  For this reason, everything we receive needs to come in
 *  a transit envelope to us from the user causing things to happen.
 *
 * Conversations are a special case because they rely on a fanout daemon which
 *  exists so that the humans in the system don't have to know all of the
 *  (eventual) recipients.  In this case we are relying on the fanout server
 *  to be sure to verify the users sending it messages.  In the event it goes
 *  rogue, the price of conversation convenience means that it can cram
 *  (user-)detectable/discardable garbage into specific conversations.
 */
function ReceiveDeliveryConnection(conn) {
  this.conn = conn;
}
ReceiveDeliveryConnection.prototype = {
  INITIAL_STATE: 'root',

  /**
   * Receive/process a transit message from a user directed to us for
   *  delivery to our user or our conversation daemon.
   */
  _msg_root_deliverTransit: function(msg) {
    // -- try and open the inner envelope.
    // (catch exceptions from the decryption; bad messages can happen)
    try {
      var self = this;
      return when(fauxPersonEnqueueProcessNow(this.conn.serverConfig,
                                              msg.msg,
                                              this.conn.clientPublicKey,
                                              this.conn.log),
        function yeaback() {
          self.conn.writeMessage({type: "ack"});
          return 'root';
        },
        function errback() {
          // XXX bad actor analysis feeding
          self.conn.writeMessage({type: "bad"});
          // the bad message is notable but non-fatal
          return 'root';
        });
    }
    catch(ex) {
      // XXX log that a bad message happened
      // XXX note bad actor evidence
      // Tell the other server it fed us something gibberishy so it can
      //  detect a broken or bad actor in its midst.
      this.conn.writeMessage({
        type: "bad",
      });
      return 'root';
    }
  },

  /**
   * Receive/process a message from a fanout server to one of our users
   *  regarding a conversation our user should be subscribed to.
   */
  _msg_root_deliverServer: function(msg) {
    var self = this;
    return when(fauxServerEnqueueProcessNow(this.conn.serverConfig,
                                            msg.msg,
                                            this.conn.clientPublicKey,
                                            this.conn.log),
      function yeaback() {
        self.conn.writeMessage({type: "ack"});
        return 'root';
      },
      function errback() {
        self.conn.writeMessage({type: "bad"});
        return 'root';
      });
  },
};


var InitialFanoutToUserMessageTask = exports.InitialFanoutToUserMessageTask =
    taskMaster.defineTask({
  name: "initialFanoutToUserMessage",
  args: ['config', 'envelope', 'otherServerKey'],
  steps: {
    /**
     * The other fanout server isn't supposed to see our user's root key in
     *  the clear, so the best it can do is tell key.  (note that I'm not sure
     *  that's going to be a long-lived invariant.)
     */
    verify_map_our_user_tell_key_to_root: function() {
      return this.config.authApi.serverGetUserAccountByTellKey(
               this.envelope.name);
    },
    /**
     * Now check that the alleged sending key is authorized to talk to our
     *  user.
     */
    check_authorized_to_talk_to_user: function(ourUserRootKey) {
      if (!ourUserRootKey)
        throw new $taskerrors.BadNameError();
      this.ourUserRootKey = ourUserRootKey;
      // loopback messages sent from us to ourselves for our own user are of
      //  course authorized...
      if (this.otherServerKey === this.config.keyring.boxingPublicKey &&
          this.envelope.name === this.envelope.senderKey)
        return true;
      return this.config.authApi.userAssertServerUser(
        ourUserRootKey, this.otherServerKey, this.envelope.senderKey);
    },
    check_proof_and_authorize_conversation: function() {
      var proofPayload = JSON.parse(
                           this.config.keyring.openBoxUtf8(
                             this.envelope.proof,
                             this.envelope.proofNonce,
                             this.envelope.senderKey));
      if (proofPayload.convId !== this.envelope.convId ||
          proofPayload.name !== this.ourUserRootKey)
        throw new $keyops.MalformedOrReplayPayloadError();
      return this.config.authApi.userAuthorizeServerForConversation(
        this.ourUserRootKey, this.otherServerKey, this.envelope.convId,
        this.envelope.senderKey);
    },
    back_end_hand_off: function() {
      return this.config.storeApi.convMessageForUser(this.envelope,
                                                     this.otherServerKey);
    },
  },
});

/**
 * Process a message from a fan-out server about a conversation to a user.
 */
var FanoutToUserMessageTask = exports.FanoutToUserMessageTask =
    taskMaster.defineTask({
  name: "fanoutToUserMessage",
  args: ['config', 'envelope', 'otherServerKey'],
  steps: {
    /**
     * The other fanout server isn't supposed to see our user's root key in
     *  the clear, so the best it can do is tell key.  (note that I'm not sure
     *  that's going to be a long-lived invariant.)
     */
    verify_map_our_user_tell_key_to_root: function() {
      return this.config.authApi.serverGetUserAccountByTellKey(
               this.envelope.name);
    },
    check_authorized_conversation: function(ourUserRootKey) {
      return this.config.authApi.userAssertServerConversation(
        ourUserRootKey, this.otherServerKey, this.envelope.convId);
    },
    back_end_hand_off: function() {
      return this.config.storeApi.convMessageForUser(this.envelope,
                                                     this.otherServerKey);
    },
  },
});

/**
 * Process a user-to-user message.
 */
var UserToUserMessageTask = taskMaster.defineTask({
  name: "userToUserMessage",
  steps: {
    check_authorized_to_talk_to_user: function(arg) {
      return this.arg.config.authApi.userAssertServerUser(
        arg.innerEnvelope.name, arg.otherServerKey,
        arg.outerEnvelope.senderKey);
    },
    back_end_hand_off: function() {
      var arg = this.arg;
      return arg.config.storeApi.messageForUser('user',
                                                arg.innerEnvelope.name,
                                                arg.innerEnvelope.payload,
                                                arg.outerEnvelope.nonce,
                                                arg.outerEnvelope.senderKey);
    },
  },
});

/**
 * Fan-in conversation join processing; another user is telling us they are
 *  inviting us to a conversation and so we should add the auth to receive
 *  messages and tell them when we have done so.
 */
var ConversationJoinTask = taskMaster.defineTask({
  name: "conversationJoin",
  args: ['config', 'outerEnvelope', 'innerEnvelope', 'otherServerKey'],
  steps: {
    /**
     * Make sure the user saying this is a friend of our user.
     */
    check_authorization: function() {
      return this.config.authApi.userAssertServerUser(
        this.innerEnvelope.name, this.otherServerKey,
        this.outerEnvelope.senderKey);
    },
    /**
     * Add the authorization for the conversation server to talk to us.
     */
    add_auth: function() {
      return this.config.authApi.userAuthorizeServerForConversation(
        this.innerEnvelope.name, this.innerEnvelope.serverName,
        this.innerEnvelope.convId, this.outerEnvelope.senderKey);
    },
    /**
     * Resend the message back to the maildrop of the person inviting us so
     *  they can finish the add process.
     */
    resend_joined: function() {
      return this.config.senderApi.sendServerEnvelopeToServer({
        type: "joined",
        name: this.outerEnvelope.senderKey,
        nonce: this.innerEnvelope.nonce,
        payload: this.innerEnvelope.payload,
      }, this.otherServerKey);
    },
  },
});

/**
 * Fan-in conversation join completion; the user we invited has responded back
 *  that they have performed the join steps on their end, so we can now re-send
 *  our original packet to the conversation fan-out server to complete the add.
 */
var ConversationJoinedTask = taskMaster.defineTask({
  name: "conversationJoined",
  args: ['config', 'envelope', 'otherServerKey'],
  steps: {
    /**
     * Unbox the payload to make sure the named user is consistent.
     */
    open_envelope: function() {
      var outerEnvelope = this.envelope;
      this.innerEnvelope = JSON.parse(
                this.config.keyring.openBoxUtf8(outerEnvelope.payload,
                                                outerEnvelope.nonce,
                                                outerEnvelope.name));
      if (this.innerEnvelope.type !== "resend")
        throw new $taskerrors.MalformedOrReplayPayloadError(
                    this.innerEnvelope.type);
    },
    check_named_user_is_our_user: function() {
      return this.config.authApi.serverGetUserAccountByTellKey(
               this.envelope.name);
    },
    resend: function(userRootKey) {
      if (!userRootKey)
        throw new $taskerrors.UnauthorizedUserError(userRootKey);
      return this.config.senderApi.sendPersonEnvelopeToServer(userRootKey,
        {
          senderKey: this.envelope.name,
          nonce: this.innerEnvelope.nonce,
          innerEnvelope: this.innerEnvelope.payload
        },
        this.innerEnvelope.serverName);
    },
  },
});

var CreateConversationTask = taskMaster.defineTask({
  name: 'createConversation',
  args: ['config', 'outerEnvelope', 'innerEnvelope', 'otherServerKey'],
  steps: {
    check_from_our_user_from_our_server: function() {
      if (this.otherServerKey !== this.config.keyring.boxingPublicKey)
        throw new Error($taskerrors.UnauthorizedUserError("not our server"));
      return this.config.authApi.serverGetUserAccountByTellKey(
               this.outerEnvelope.senderKey);
    },
    verify_our_user: function(userRootKey) {
      if (!userRootKey)
        throw new $taskerrors.UnauthorizedUserError("not our user");
      this.userRootKey = userRootKey;
    },
    /**
     * We require that the user generates an add for themselves as the first
     *  add and that they be adding at least one other person.
     */
    verify_add_constraints: function() {
      var addPayloads = this.innerEnvelope.payload.addPayloads;
      if (addPayloads.length < 2)
        throw new $taskerrors.MalformedPayloadError('Not enough adds');
      if (addPayloads[0].tellKey !== this.arg.outerEnvelope.senderKey)
        throw new $taskerrors.MalformedPayloadError('Did not add self first');
    },
    /**
     * Create 'join' and 'message' fanout messages from the payload; these will
     *  be sent in a single backlog message to all initial participants.
     */
    formulate_initial_fanout_messages: function() {
      var convPayload = this.innerEnvelope.payload;
      var fanouts = this.initialFanouts = [];
      var now = this.now = Date.now(),
          senderKey = this.outerEnvelope.senderKey;
      // - joins
      for (var iAdd = 0; iAdd < convPayload.addPayloads.length; iAdd++) {
        var addPayload = convPayload.addPayloads[iAdd];
        fanouts.push({
          type: 'join',
          sentBy: senderKey,
          invitee: addPayload.tellKey,
          receivedAt: now,
          nonce: addPayload.attestationNonce,
          payload: addPayload.attestationPayload,
        });
      }
      // - message
      fanouts.push({
        type: 'message',
        sentBy: senderKey,
        receivedAt: now,
        nonce: convPayload.msgNonce,
        payload: convPayload.msgPayload,
      });
    },
    /**
     * Create the conversation, potentially failing if there is somehow already
     *  such a conversation.
     *
     * XXX we do not currently validate possession of the private key because of
     *  signature verification costs.  It's not a major risk because the
     *  conversation id space is a huge huge keyspace where the chance of
     *  accidental collision should be stupidly low.  And in the case of
     *  intentional collision, the request simply fails.
     * XXX since this is an asynchronous thing, we need to handle the failure
     *  in a way that we send something back to the user.
     * XXX also, bad/broken actor entropy
     */
    create_conversation_race: function() {
      return this.config.fanoutApi.createConversation(
               this.innerEnvelope.convId, this.userRootKey, this.initialFanouts);
    },

    authorize_all_participants_including_creator: function() {
      return this.config.authApi.convInitialAuthorizeMultipleUsers(
        this.innerEnvelope.convId,
        this.innerEnvelope.payload.addPayloads);
    },

    send_welcome_to_initial_recipients: function() {
      var convPayload = this.innerEnvelope.payload,
          convId = this.innerEnvelope.convId,
          senderKey = this.outerEnvelope.senderKey,
          senderNonce = this.outerEnvelope.nonce,
          nowish = this.now,
          promises = [],
          config = this.config, senderApi = config.senderApi;
      // nonce for our pairwise unique welcome messages, so nonce reuse is fine
      var ourNonce = $keyops.makeBoxNonce();
      for (var iAdd = 0; iAdd < convPayload.addPayloads.length; iAdd++) {
        var addPayload = convPayload.addPayloads[iAdd];

        var welcomeMsg = {
          type: 'welcome',
          sentBy: senderKey,
          receivedAt: nowish,
          //nonce: senderNonce, // (we are not boxing using this nonce)
          payload: {
            inviteNonce: addPayload.nonce,
            boxedInvite: addPayload.inviteePayload,
            backlog: this.initialFanouts,
          },
        };
        var boxedWelcomeMsg = config.keyring.boxUtf8(
          JSON.stringify(welcomeMsg), ourNonce, addPayload.envelopeKey);
        promises.push(senderApi.sendServerEnvelopeToServer({
            type: 'initialfan',
            name: addPayload.tellKey,
            senderKey: senderKey,
            convId: convId,
            proof: addPayload.inviteProof,
            proofNonce: addPayload.proofNonce,
            nonce: ourNonce,
            payload: boxedWelcomeMsg
          },
          addPayload.serverKey));
      }
      return $Q.all(promises);
    },
  },
});

/**
 * Send a message to all
 */
function conversationSendToAllRecipients(config, convId, messageObj,
                                         usersAndServers) {
  var keyring = config.keyring,
      senderApi = config.senderApi,
      nonce = $keyops.makeBoxNonce();
  // XXX we are basically doing this in parallel; might not be advisable;
  //  revisit once we actually start using queues.
  var promises = [];
  for (var i = 0; i < usersAndServers.length; i++) {
    var userAndServer = usersAndServers[i];

    // - box the fanout message for the user
    var boxed = keyring.boxUtf8(JSON.stringify(messageObj), nonce,
                            userAndServer.userEnvelopeKey);
    // - create the server-to-server envelope
    var serverEnvelope = {
      type: 'fannedmsg',
      name: userAndServer.userTellKey,
      convId: convId,
      nonce: nonce,
      payload: boxed,
    };
    promises.push(
      senderApi.sendServerEnvelopeToServer(serverEnvelope,
                                           userAndServer.serverKey));
  }
  return $Q.all(promises);
}

/**
 * The user has sent a message to the conversation...
 */
var ConversationMessageTask = taskMaster.defineTask({
  name: "conversationMessage",
  args: ['config', 'outerEnvelope', 'innerEnvelope', 'otherServerKey'],
  steps: {
    assert_author_in_on_conversation: function() {
      return this.config.authApi.convAssertServerUser(
        this.innerEnvelope.convId, this.otherServerKey,
        this.outerEnvelope.senderKey);
    },
    formulate_fanout_message_and_persist: function() {
      this.fanoutMessage = {
        type: 'message',
        sentBy: this.outerEnvelope.senderKey,
        receivedAt: Date.now(),
        // the message/envelope are encrypted with the same nonce as what we
        //  received.
        nonce: this.outerEnvelope.nonce,
        payload: this.innerEnvelope.payload,
      };
      return this.config.fanoutApi.addMessageToConversation(
               this.innerEnvelope.convId, this.fanoutMessage);
    },
    get_recipients: function() {
      return this.config.authApi.convGetParticipants(
               this.innerEnvelope.convId);
    },
    send_to_all_recipients: function(usersAndServers) {
      return conversationSendToAllRecipients(this.config,
                                             this.innerEnvelope.convId,
                                             this.fanoutMessage,
                                             usersAndServers);
    },
  },
});

/**
 * A user has sent a metadata message to the conversation...
 */
var ConversationMetaTask = taskMaster.defineTask({
  name: "conversationMeta",
  args: ['config', 'innerEnvelope', 'outerEnvelope', 'otherServerKey'],
  steps: {
    check_already_in_on_conversation: function() {
      return this.config.authApi.convAssertServerUser(
        this.innerEnvelope.convId, this.otherServerKey,
        this.outerEnvelope.senderKey);
    },
    formulate_fanout_message_and_persist: function() {
      this.fanoutMessage = {
        type: 'meta',
        sentBy: this.outerEnvelope.senderKey,
        receivedAt: Date.now(),
        // the message/envelope are encrypted with the same nonce as what we
        //  received.
        nonce: this.outerEnvelope.nonce,
        payload: this.innerEnvelope.payload,
      };
      return this.config.fanoutApi.updateConvPerUserMetadata(
               this.innerEnvelope.convId, this.outerEnvelope.senderKey,
               this.fanoutMessage);
    },
    get_recipients: function() {
      return this.config.authApi.convGetParticipants(
               this.innerEnvelope.convId);
    },
    send_to_all_recipients: function(usersAndServers) {
      return conversationSendToAllRecipients(this.config,
                                             this.innerEnvelope.convId,
                                             this.fanoutMessage,
                                             usersAndServers);
    },
  },
});

/**
 * Process the final step of the "add a user to a conversation" process; the
 *  inviter should have already gotten confirmation from the invitee that they
 *  have added the authorization on their server to receive messages from this
 *  conversation.
 */
var ConversationAddTask = taskMaster.defineTask({
  name: "conversationAdd",
  args: ['config', 'innerEnvelope', 'outerEnvelope', 'otherServerKey'],
  steps: {
    assert_inviter_in_on_conversation: function() {
      return this.config.authApi.convAssertServerUser(
        this.innerEnvelope.convId, this.otherServerKey,
        this.outerEnvelope.senderKey);
    },
    add_authorization_or_reject_if_already_authorized: function() {
      return this.config.authApi.convAuthorizeServerUser( // auto-rejects
               this.innerEnvelope.convId, this.innerEnvelope.serverName,
               this.innerEnvelope.name,
               this.innerEnvelope.payload.envelopeKey);
    },
    fetch_backlog: function() {
      return this.config.fanoutApi.getAllConversationData(
               this.innerEnvelope.convId);
    },
    welcome_invitee: function(allConvData) {
      var backfillMessage = {
        type: 'welcome',
        sentBy: this.outerEnvelope.senderKey,
        receivedAt: Date.now(),
        //nonce: this.outerEnvelope.nonce,
        payload: {
          inviteNonce: this.outerEnvelope.nonce,
          boxedInvite: this.innerEnvelope.payload.inviteePayload,
          backlog: allConvData,
        },
      };
      var nonce = $keyops.makeBoxNonce();
      // boxed to the user's envelope key so their mailstore can read it
      var boxedBackfillMessage = this.config.keyring.boxUtf8(
        JSON.stringify(backfillMessage), nonce,
        this.innerEnvelope.payload.envelopeKey);
      return this.config.senderApi.sendServerEnvelopeToServer({
          type: 'fannedmsg',
          name: this.innerEnvelope.name,
          convId: this.innerEnvelope.convId,
          nonce: nonce,
          payload: boxedBackfillMessage,
        }, this.innerEnvelope.serverName);
    },
    formulate_fanout_join_message_and_persist: function() {
      this.fanoutMessage = {
        type: 'join',
        sentBy: this.outerEnvelope.senderKey,
        invitee: this.innerEnvelope.name,
        receivedAt: Date.now(),
        nonce: this.innerEnvelope.payload.attestationNonce,
        payload: this.innerEnvelope.payload.attestationPayload,
      };
      return this.config.fanoutApi.addMessageToConversation(
               this.innerEnvelope.convId, this.fanoutMessage);
    },
    get_recipients: function() {
      return this.config.authApi.convGetParticipants(
               this.innerEnvelope.convId);
    },
    send_to_all_recipients: function(usersAndServers) {
      return conversationSendToAllRecipients(this.config,
                                             this.innerEnvelope.convId,
                                             this.fanoutMessage,
                                             usersAndServers);
    },
  },
});



/**
 * Connection to let a mailstore/user tell us who they are willing to receive
 *  messsages from.
 *
 * XXX notyet, mailstore can handle direct
 */
/*
function ContactConnection(server, sock) {
};
ContactConnection.prototype = {
  _msg_root_addContact: function(msg) {

  },

  _msg_root_delContact: function(msg) {
  },
};
*/

/**
 * Message retrieval (fetch) from a maildrop by a mailstore.
 *
 * Pickup connections have simple semantics.  Once you connect and authenticate,
 *  we start sending messages.  You need to acknowledge each message so we can
 *  purge it from our storage.  Once we run out of queued messages, we send a
 *  'realtime' notification to let you know that there are no more queued
 *  messages and that you are now subscribed for realtime notification of new
 *  messages.  You need to acknowledge realtime messages just like queued
 *  messages.  If you don't want realtime messages, disconnect.
 *
 * XXX notyet, mailstore can handle direct
 */
/*
function PickupConnection(server, sock) {
};
PickupConnection.prototype = {
  _msg_wantAck_ack: function(msg) {
  },
};
*/

var fauxEstablishProcessNow = exports.fauxEstablishProcessNow =
    function fauxEstablishProcessNow(config, outerEnvelope, otherServerKey) {
  var innerEnvelope = JSON.parse(
    config.keyring.openBoxUtf8(outerEnvelope.innerEnvelope,
                               outerEnvelope.nonce,
                               outerEnvelope.senderKey));
  var receivedAt = Date.now();
  var receivedBundle = {
    type: 'contactReq',
    name: outerEnvelope.name,
    senderKey: outerEnvelope.senderKey,
    nonce: outerEnvelope.nonce,
    innerEnvelope: innerEnvelope,
    otherServerKey: otherServerKey,
    receivedAt: receivedAt,
  };
  return config.storeApi.contactRequestForUser(receivedBundle);
};

/**
 * Connection request to establish mutual contact relationship (aka friendship).
 *  This is intended to cover the the base case of two server who don't already
 *  trust each other, though we want logic that provides benefit to servers that
 *  already trust each other.  Ideally that could be handled by the delivery
 *  connection mechanism once that starts being more batchy/persistent.
 */
function ReceiveEstablishConnection(conn) {
  this.conn = conn;
}
ReceiveEstablishConnection.prototype = {
  INITIAL_STATE: 'root',

  /**
   * Validate the identity of the sender by opening the transit inner env box.
   */
  _msg_root_establish: function(msg) {
    // -- try and open the inner envelope.
    // (catch exceptions from the decryption; bad messages can happen)
    try {
      var self = this;
      return when(fauxEstablishProcessNow(this.conn.serverConfig, msg.msg,
                                          this.conn.clientPublicKey),
        function yeaback() {
          self.conn.writeMessage({type: "ack"});
          return 'root';
        },
        function errback() {
          // XXX bad actor analysis feeding
          self.conn.writeMessage({type: "bad"});
          // the bad message is notable but non-fatal
          return 'root';
        });
    }
    catch(ex) {
      this.conn.log.handlerFailure(ex);
      // XXX note bad actor evidence
      // Tell the other server it fed us something gibberishy so it can
      //  detect a broken or bad actor in its midst.
      this.conn.writeMessage({
        type: "bad",
      });
      return 'root';
    }
  },
};


exports.makeServerDef = function(serverConfig) {
  return {
    endpoints: {
      'deliver.deuxdrop': {
        implClass: ReceiveDeliveryConnection,
        serverConfig: serverConfig,
        authVerifier: function(endpoint, clientKey) {
          // we are just checking that they are allowed to talk to us at all
          return serverConfig.authApi.serverCheckServerAuth(clientKey);
        }
      },
      'establish.deuxdrop': {
        implClass: ReceiveEstablishConnection,
        serverConfig: serverConfig,
        authVerifier: function(endpoint, clientKey) {
          // XXX we are willing to talk to anyone, although we should have
          //  some anti-DoS logic in place.
          return true;
        },
      },
    },
  };
};

}); // end define
