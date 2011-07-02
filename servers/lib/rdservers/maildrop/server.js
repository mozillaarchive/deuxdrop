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
    outerEnvelope: outerEnvelope,
    innerEnvelope: innerEnvelope,
    otherServerKey: otherServerKey,
  };
  switch (innerEnvelope.type) {
    // - other user to user
    case "user":
      return new UserToUserMessageTask(arg, _logger);

    // - other user to user's maildrop
    case "joinconv":
      return new ConversationJoinTask(arg, _logger);

    case "convadd":
      return new ConversationAddTask(arg, _logger);
    case "convmsg":
      return new ConversationMessageTask(arg, _logger);
    case "convmeta":
      return new ConversationMetaTask(arg, _logger);

    // - user to their own maildrop
    case "createconv":
      return new CreateConversationTask(arg, _logger);

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
  switch (envelope.type) {
    case "joined":
      return new ConversationJoinedTask({
        outerEnvelope: outerEnvelope,
        innerEnvelope: innerEnvelope,
        otherServerKey: otherServerKey,
      }, _logger);

    case "fannedmsg":
      return new FanoutToUserMessageTask({
        envelope: envelope,
        otherServerKey: otherServerKey,
      }, _logger);
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
          self.sendMessage({type: "ack"});
          return 'root';
        },
        function errback() {
          // XXX bad actor analysis feeding
          self.sendMessage({type: "bad"});
          // the bad message is notable but non-fatal
          return 'root';
        });
    }
    catch(ex) {
      // XXX log that a bad message happened
      // XXX note bad actor evidence
      // Tell the other server it fed us something gibberishy so it can
      //  detect a broken or bad actor in its midst.
      this.sendMessage({
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
    return when(fauxServerEnqueueProcessNow(this.conn.serverConfig,
                                            msg.msg,
                                            this.conn.clientPublicKey,
                                            this.conn.log),
      function yeaback() {
        self.sendMessage({type: "ack"});
        return 'root';
      },
      function errback() {
        self.sendMessage({type: "bad"});
        return 'root';
      });
  },
};

/**
 * Process a message from a fan-out server about a conversation to a user.
 */
var FanoutToUserMessageTask = exports.FanoutToUserMessageTask =
    taskMaster.defineTask({
  name: "fanoutToUserMessage",
  steps: {
    check_authorized_conversation: function(arg) {
      return arg.config.authApi.userAssertServerConversation(
        arg.envelope.name, arg.otherServerKey, arg.envelope.convId);
    },
    back_end_hand_off: function() {
      var arg = this.arg;
      return arg.config.storeApi.messageForUser(arg.envelope.name,
                                                arg.envelope.payload,
                                                arg.envelope.nonce,
                                                arg.otherServerKey);
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
      return arg.config.storeApi.messageForUser(arg.innerEnvelope.name,
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
  steps: {
    /**
     * Make sure the user saying this is a friend of our user.
     */
    check_authorization: function(arg) {
      return arg.config.authApi.userAssertServerUser(
        arg.innerEnvelope.name, arg.otherServerKey,
        arg.outerEnvelope.senderKey);
    },
    /**
     * Add the authorization for the conversation server to talk to us.
     */
    add_auth: function() {
      var arg = this.arg;
      return arg.config.authApi.userAuthorizeServerForConversation(
        arg.innerEnvelope.name, arg.innerEnvelope.serverName,
        arg.innerEnvelope.serverName, arg.outerEnvelope.senderKey);
    },
    /**
     * Resend the message back to the maildrop of the person inviting us so
     *  they can finish the add process.
     */
    resend_joined: function() {
      var arg = this.arg;
      return arg.config.senderApi.sendServerEnvelopeToServer({
        type: "joined",
        name: arg.outerEnvelope.senderKey,
        nonce: arg.outerEnvelope.nonce,
        payload: arg.innerEnvelope.payload,
      }, arg.otherServerKey);
    },
  },
});

var ConversationJoinedTask = taskMaster.defineTask({
  name: "conversationJoined",
  steps: {
    /**
     * Unbox the payload to make sure the named user is consistent.
     */
    open_envelope: function(arg) {
      var outerEnvelope = arg.msg;
      this.innerEnvelope = JSON.parse(
                arg.config.keyring.openBoxUtf8(outerEnvelope.payload,
                                               outerEnvelope.nonce,
                                               outerEnvelope.name));
      if (this.innerEnvelope.type !== "resend")
        throw new $taskerrors.MalformedOrReplayPayloadError(
                    this.innerEnvelope.type);
    },
    check_named_user_is_our_user: function() {
      return this.arg.config.authApi.serverGetUserAccountByTellKey(
               this.arg.msg.name);
    },
    resend: function(userRootKey) {
      if (!userRootKey)
        throw new $taskerrors.UnauthorizedUserError(userRootKey);
      return this.arg.config.senderApi.sendPersonEnvelopeToServer(userRootKey,
        {
          senderKey: this.arg.msg.name,
          nonce: this.arg.msg.nonce,
          innerEnvelope: this.innerEnvelope.payload
        },
        this.innerEnvelope.serverName);
    },
  },
});

var CreateConversationTask = taskMaster.defineTask({
  name: 'createConversation',
  steps: {
    check_from_our_user_from_our_server: function(arg) {
      if (arg.otherServerKey !== arg.config.keyring.boxingPublicKey)
        throw new Error($taskerrors.UnauthorizedUserError("not our server"));
      return arg.config.authApi.serverGetUserAccountByTellKey(
               arg.outerEnvelope.senderKey);
    },
    verify_our_user: function(isOurUser) {
      if (!isOurUser)
        throw new $taskerrors.UnauthorizedUserError("not our user");
    },
    /**
     * Create the conversation, potentially failing if there is somehow already
     *  such a conversation.
     *
     * XXX since this is an asynchronous thing, we need to handle the failure
     *  in a way that we send something back to the user.
     * XXX also, bad/broken actor entropy
     */
    create_conversation_race: function() {

    },
    send_welcome_to_initial_recipients: function() {
    },
  },
});

function conversationSendToAllRecipients(config, convId, message,
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
    var boxed = keyring.box(message, nonce,
                            userAndServer.userEnvelopeKey);
    // - create the server-to-server envelope
    var serverEnvelope = {
      type: 'fannedmsg',
      name: userAndServer.userTellKey,
      convId: convId,
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
  steps: {
    assert_author_in_on_conversation: function(arg) {
      return arg.config.authApi.convAssertServerConversation(
        arg.innerEnvelope.convId, arg.otherServerKey,
        arg.outerEnvelope.senderKey);
    },
    formulate_fanout_message_and_persist: function() {
      this.fanoutMessage = {
        type: 'message',
        sentBy: this.arg.outerEnvelope.senderKey,
        receivedAt: Date.now(),
        // the message/envelope are encrypted with the same nonce as what we
        //  received.
        nonce: arg.outerEnvelope.nonce,
        payload: this.arg.innerEnvelope.payload,
      };
      return this.arg.config.fanoutApi.addMessageToConversation(
               this.fanoutMessage);
    },
    get_recipients: function() {
      return this.arg.config.authApi.convGetParticipants(
               this.arg.innerEnvelope.convId);
    },
    send_to_all_recipients: function(usersAndServers) {
      return conversationSendToAllRecipients(this.arg.config,
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
  steps: {
    assert_inviter_in_on_conversation: function(arg) {
      return arg.config.authApi.convAssertServerConversation(
        arg.innerEnvelope.convId, arg.otherServerKey,
        arg.outerEnvelope.senderKey);
    },
    add_authorization_or_reject_if_already_authorized: function() {
      var arg = this.arg;
      return arg.config.authApi.convAuthorizeServerUser( // auto-rejects
               arg.innerEnvelope.convId, arg.innerEnvelope.serverName,
               arg.innerEnvelope.name,
               arg.innerEnvelope.payload.userEnvelopeKey);
    },
    fetch_backlog: function() {
      return this.arg.config.fanoutApi.getAllConversationData(
               arg.innerEnvelope.convId);
    },
    welcome_invitee: function(allConvData) {
      var backfillMessage = {
        type: 'welcome',
        sentBy: this.arg.outerEnvelope.senderKey,
        receivedAt: Date.now(),
        nonce: this.arg.outerEnvelope.nonce,
        payload: {
          boxedMeta: this.arg.innerEnvelope.payload.inviteePayload,
          backlog: allConvData,
        },
      };
    },
    formulate_fanout_join_message_and_persist: function() {
      this.fanoutMessage = {
        type: 'join',
        sentBy: this.arg.outerEnvelope.senderKey,
        receivedAt: Date.now(),
        // the message/envelope are encrypted with the same nonce as what we
        //  received.
        nonce: arg.outerEnvelope.nonce,
        payload: this.arg.innerEnvelope.payload.attestationPayload,
      };
      return this.arg.config.fanoutApi.addMessageToConversation(
               this.fanoutMessage);
    },
    get_recipients: function() {
      return this.arg.config.authApi.convGetParticipants(
               this.arg.innerEnvelope.convId);
    },
    send_to_all_recipients: function(usersAndServers) {
      return conversationSendToAllRecipients(this.arg.config,
                                             this.innerEnvelope.convId,
                                             this.fanoutMessage,
                                             usersAndServers);
    },
  },
});

var ConversationMetaTask = taskMaster.defineTask({
  name: "conversationMeta",
  steps: {
    check_already_in_on_conversation: function(arg) {
      return arg.config.authApi.convAssertServerConversation(
        arg.innerEnvelope.convId, arg.otherServerKey,
        arg.outerEnvelope.senderKey);
    },
    formulate_fanout_message_and_persist: function() {
      this.fanoutMessage = {
        type: 'meta',
        sentBy: this.arg.outerEnvelope.senderKey,
        receivedAt: Date.now(),
        // the message/envelope are encrypted with the same nonce as what we
        //  received.
        nonce: arg.outerEnvelope.nonce,
        payload: this.arg.innerEnvelope.payload,
      };
      return this.arg.config.fanoutApi.updateConvPerUserMetadata(
               this.arg.innerEnvelope.convId, this.fanoutMessage);
    },
    get_recipients: function() {
      return this.arg.config.authApi.convGetParticipants(
               this.arg.innerEnvelope.convId);
    },
    send_to_all_recipients: function(usersAndServers) {
      return conversationSendToAllRecipients(this.arg.config,
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

exports.makeServerDef = function(serverConfig) {
  return {
    endpoints: {
      'drop/deliver': {
        implClass: ReceiveDeliveryConnection,
        authVerifier: function(endpoint, clientKey) {
          // we are just checking that they are allowed to talk to us at all
          return serverConfig.authApi.serverCheckServerAuth(clientKey);
        }
      },
    },
  };
};

}); // end define
