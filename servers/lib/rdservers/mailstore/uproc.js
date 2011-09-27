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
 *
 **/

define(
  [
    'q',
    'rdcommon/log',
    'rdcommon/taskidiom', 'rdcommon/taskerrors',
    'rdcommon/identities/pubident',
    './server',
    './ustore',
    'module',
    'exports'
  ],
  function(
    $Q,
    $log,
    $task, $taskerrors,
    $pubident,
    $mailstore_server,
    $ustore,
    $module,
    exports
  ) {
var when = $Q.when;

var LOGFAB = exports.LOGFAB = $log.register($module, {
});

var taskMaster = $task.makeTaskMasterForModule($module, LOGFAB);

function UserProcessorRegistry(serverConfig, dbConn, _logger) {
  this._config = serverConfig;
  this._db = dbConn;
  this._logger = _logger;

  this._procByRoot = {};
  this._procByTell = {};

  this._bound_getUserMessageProcessorUsingEffigy =
    this.getUserMessageProcessorUsingEffigy.bind(this);
}
exports.UserProcessorRegistry = UserProcessorRegistry;
UserProcessorRegistry.prototype = {
  toString: function() {
    return '[UserProcessorRegistry]';
  },
  toJSON: function() {
    return {
      type: 'UserProcessorRegistry',
    };
  },

  _getUserMessageProcessorUsingTellKey: function(userTellKey) {
    if (this._procByTell.hasOwnProperty(userTellKey))
      return this._procByTell[userTellKey];
    var self = this;
    var promise = when(
      this._config.authApi.serverFetchUserEffigyUsingTellKey(userTellKey,
                                                             "store"),
      this._bound_getUserMessageProcessorUsingEffigy
      // rejection pass-through
    );
    // put the promise in there for now to avoid multiple in-flights.
    this._procByTell[userTellKey] = promise;
    return promise;
  },

  getUserMessageProcessorUsingEffigy: function(userEffigy) {
    if (this._procByRoot.hasOwnProperty(userEffigy.rootPublicKey))
      return this._procByRoot[userEffigy.rootPublicKey];

    var processor = new UserMessageProcessor(this._config, userEffigy, this._db,
                                             this._config.userConnTracker,
                                             this._logger);
    // save the processor in the table, overwriting the load promise
    var tellKey = userEffigy.pubring.getPublicKeyFor("messaging", "tellBox");
    this._procByTell[tellKey] = processor;
    this._procByRoot[userEffigy.rootPublicKey] = processor;
    return processor;
  },

  /**
   * Given a message for a user, find their existing message processor and
   *  hand it off or create a new message processor as needed.
   */
  convMessageForUser: function(stransitEnv, otherServerKey) {
    return when(this._getUserMessageProcessorUsingTellKey(stransitEnv.name),
                function(uproc) {
      return uproc.convMessageForUser(stransitEnv, otherServerKey);
    });
  },


  /**
   * Receive a friend request, queueing it for transmission to the client.
   */
  contactRequestForUser: function(receivedBundle) {
    return when(this._getUserMessageProcessorUsingTellKey(receivedBundle.name),
                function(uproc) {
      return uproc.contactRequestForUser(receivedBundle);
    });
  },
};


/**
 * MRU-persistent processor of messages for users that keeps around state so
 *  that we can process batches of data or bursty data without setup costs for
 *  every message.
 */
function UserMessageProcessor(serverConfig, effigy, dbConn, connTracker,
                              _logger) {
  this.serverConfig = serverConfig;
  this.effigy = effigy;
  this.store = new $ustore.UserBehalfDataStore(effigy.rootPublicKey,
                                               dbConn);
  this.connTracker = connTracker;
  this._logger = _logger;
}
UserMessageProcessor.prototype = {
  toString: function() {
    return '[UserMessageProcessor]';
  },
  toJSON: function() {
    return {
      type: 'UserMessageProcessor',
    };
  },

  //////////////////////////////////////////////////////////////////////////////
  // Messages from the internet

  /**
   * Process a message for the user.
   *
   * XXX someone in this path should be performing some kind of queueing
   */
  convMessageForUser: function(stransitEnv, otherServerKey) {
    // -- unbox
    var fanoutMsg = JSON.parse(
                      this.effigy.storeEnvelopeKeyring.openBoxUtf8(
                        stransitEnv.payload, stransitEnv.nonce,
                        otherServerKey));
    var arg = {
      effigy: this.effigy, store: this.store, uproc: this,
      convId: stransitEnv.convId,
      fanoutMsg: fanoutMsg, fanoutMsgRaw: stransitEnv.payload,
      fanoutNonce: stransitEnv.nonce,
      transitServerKey: otherServerKey,
    };
    switch (fanoutMsg.type) {
      case 'welcome':
        return (new UserConvWelcomeTask(arg, this._logger)).run();
      case 'join':
        return (new UserConvJoinTask(arg, this._logger)).run();
      case 'message':
        return (new UserConvMessageTask(arg, this._logger)).run();
      case 'meta':
        return (new UserConvMetaTask(arg, this._logger)).run();

      default:
        throw new $taskerrors.MalformedPayloadError(
          'bad message type: ' + fanoutMsg.type);
    }
  },

  /**
   * Process an incoming contact request (which we might end up rejecting).
   */
  contactRequestForUser: function(receivedBundle) {
    var arg = {
      effigy: this.effigy, store: this.store, uproc: this,
      receivedBundle: receivedBundle
    };
    return (new UserIncomingContactRequestTask(arg, this._logger)).run();
  },

  //////////////////////////////////////////////////////////////////////////////
  // Client-requested actions

  issueContactRequest: function(msg) {
    var arg = {
      config: this.serverConfig,
      effigy: this.effigy, store: this.store, uproc: this,
      msg: msg,
    };
    return (new UserOutgoingContactRequestTask(arg, this._logger)).run();
  },

  /**
   * Complete the contact request/addition cycle.  This gets invoked when we
   *  have both received and incoming request and generated (and sent) an
   *  outgoing request.
   */
  _completeContactAdd: function(incoming, outgoing) {
    return $Q.wait(
      // persist contact replica block to our random-access store
      this.store.newContact(outgoing.userRootKey, outgoing.replicaBlock),
      // send replica block to all clients
      this.relayMessageToAllClients(outgoing.replicaBlock),
      // delete out our outgoing contact request
      this.store.deleteOutgoingContactRequest(outgoing.userTellKey));
  },

  //////////////////////////////////////////////////////////////////////////////
  // Client communication

  /**
   * Enqueue the given replica block for all clients and notify connected
   *  clients so they can immediately process.
   *
   * XXX we want to narrow this to subscriptions and importance at some point,
   *  of course.
   */
  relayMessageToAllClients: function(block) {
    var clientKeys = this.effigy.allClientKeys;
    var promises = [];
    for (var i = 0; i < clientKeys.length; i++) {
      promises.push(this.store.clientQueuePush(clientKeys[i], block));
    }

    this.connTracker.notifyAllOfReplicaBlock(this.effigy.rootPublicKey, block);

    return $Q.all(promises);
  },

  //////////////////////////////////////////////////////////////////////////////
};


var UserOutgoingContactRequestTask = taskMaster.defineEarlyReturnTask({
  name: 'userOutgoingContactRequest',
  args: ['config', 'effigy', 'store', 'uproc', 'msg'],
  steps: {
    authorize_incoming_messages_from_contact: function() {
      var serverKey =
        $pubident.peekServerSelfIdentBoxingKeyNOVERIFY(
          this.msg.serverSelfIdent);
      return $Q.wait(
        // - issue maildrop/fanout authorization
        this.config.dropApi.authorizeServerUserForContact(
          this.effigy.rootPublicKey, serverKey, this.msg.userTellKey),
        // - ensure the sending layer knows how to talk to that user too
        this.config.senderApi.setServerUrlUsingSelfIdent(
          this.msg.serverSelfIdent)
      );
    },
    send_outgoing: function() {
      return this.config.senderApi.sendContactEstablishmentMessage(
        this.msg.toRequestee,
        $pubident.peekServerSelfIdentBoxingKeyNOVERIFY(
          this.msg.serverSelfIdent));
    },
    check_for_outstanding_incoming_contact_request: function() {
      return this.store.getIncomingContactRequest(this.msg.userTellKey);
    },
    maybe_success_if_outstanding_contact_request: function(incoming) {
      // note that the fact that the incoming request was persisted means
      //  that it passed our validation.
      if (incoming)
        return this.earlyReturn(this.uproc._completeContactAdd(incoming,
                                                               this.msg));
      return undefined;
    },
    persist_outgoing: function() {
      return this.store.putOutgoingContactRequest(this.msg.userTellKey,
                                                  this.msg);
    },
  },
});

var UserIncomingContactRequestTask = taskMaster.defineEarlyReturnTask({
  name: 'userIncomingContactRequest',
  args: ['effigy', 'store', 'uproc', 'receivedBundle'],
  steps: {
    /**
     * Verify the identity of the sender by unboxing the envelope.
     */
    validate_request: function() {
      var requestEnv = JSON.parse(
                         this.effigy.storeEnvelopeKeyring.openBoxUtf8(
                           this.receivedBundle.innerEnvelope.envelope,
                           this.receivedBundle.nonce,
                           this.receivedBundle.senderKey));
      // if what was boxed was not a contact request, fail.
      if (requestEnv.type !== 'contactRequest')
        return this.earlyReturn(false);
      return undefined;
    },
    /**
     * If the request is from someone we have an outstanding request to,
     *  process it success-style.  This is done prior to the suppression
     *  check to simplify things/avoid edge cases where we mutual blackhole.
     */
    check_for_pending: function() {
      return this.store.getOutgoingContactRequest(
        this.receivedBundle.senderKey);
    },
    success_if_pending: function(outgoing) {
      if (outgoing)
        return this.earlyReturn(this.uproc._completeContactAdd(
                                this.receivedBundle, outgoing));
      return undefined;
    },
    check_for_suppression: function() {
      return this.store.checkForSuppressedContactRequest(
        this.receivedBundle.senderKey, this.receivedBundle.otherServerKey);
    },
    throw_away_if_suppressed: function(suppressed) {
      if (suppressed)
        return this.earlyReturn(false);
      return undefined;
    },
    persist: function() {
      return $Q.wait(
        this.store.putIncomingContactRequest(this.receivedBundle.receivedAt,
                                             this.receivedBundle.senderKey,
                                             this.receivedBundle)

      );
    },
    relay_request_to_clients: function() {
      return this.uproc.relayMessageToAllClients(this.receivedBundle);
    }
  },
});

/**
 * Process the welcome message, the first message any participant in a
 *  conversation ever sees from the fanout server.  Its payload consists of an
 *  invitation which includes the required meta-data to (de/en)crypt the messages
 *  in the conversation, as well as the backlog of messages sent prior to the
 *  user's invitation to join the conversation.
 *
 * Keep in mind that the mailstore only has/gets envelope keys.
 */
var UserConvWelcomeTask = taskMaster.defineTask({
  name: "userConvWelcome",
  args: ['effigy', 'store', 'uproc', 'convId',
         'fanoutMsg', 'fanoutNonce', 'transitServerKey'],
  steps: {
    verify_conversation_validity: function() {
      // - check the invite envelope layer
      var inviteEnv = JSON.parse(
                        this.effigy.storeEnvelopeKeyring.openBoxUtf8(
                          this.fanoutMsg.payload.boxedInvite,
                          this.fanoutMsg.payload.inviteNonce,
                          this.fanoutMsg.sentBy));

      if (inviteEnv.convId !== this.convId)
        throw new $taskerrors.MalformedOrReplayPayloadError('convId mismatch');
    },
    /**
     * Create the conversation by storing its participant metadata, both the
     *  bit we can see (envelope-key encrypted) and the bit we can't (body-key
     *  encrypted).  Idempotency and attacker avoidance require us to ignore a
     *  second welcome message for the same conversation.
     *
     * Note that our maildrop will only let us be subscribed to a single
     *  instance of a conversation, so this should really only happen when
     *  messages are accidentally/buggily replayed.
     */
    create_conversation_race: function() {
      this.replicaBlock = {
        fanmsg: this.fanoutMsg.payload.boxedInvite,
        sentBy: this.fanoutMsg.sentBy,
        nonce: this.fanoutMsg.payload.inviteNonce,
      };
      return this.store.newConversationRace(this.convId,
                                            this.replicaBlock);
    },
    relay: function() {
      this.uproc.relayMessageToAllClients(this.replicaBlock);
    },
    /**
     * Spawn tasks to process the backlog of messages sequentially.
     */
    process_backlog: function() {
      var deferred = $Q.defer();

      var iNext = 0, self = this, subMsgs = this.fanoutMsg.payload.backlog;

      var arg = {
        effigy: this.effigy,
        store: this.store,
        uproc: this.uproc,
        convId: this.convId,
        fanoutMsg: null,
        fanoutNonce: null,
        fanoutMsgRaw: null,
        transitServerKey: this.transitServerKey,
      };
      function procNext() {
        if (iNext >= subMsgs.length) {
          deferred.resolve();
          return;
        }
        var subFanoutMsg = subMsgs[iNext++];
        arg.fanoutMsg = subFanoutMsg;
        arg.fanoutNonce = subFanoutMsg.nonce;
        // reverse-box the message into a raw form for storage purposes
        arg.fanoutMsgRaw = self.effigy.storeEnvelopeKeyring.boxUtf8(
                             JSON.stringify(subFanoutMsg), subFanoutMsg.nonce,
                             self.transitServerKey);

        switch(subFanoutMsg.type) {
          case 'join':
            when((new UserConvJoinTask(arg, self.log)).run(),
                 procNext, deferred.reject);
            break;
          case 'message':
            when((new UserConvMessageTask(arg, self.log)).run(),
                 procNext, deferred.reject);
            break;
          case 'meta':
            when((new UserConvMetaTask(arg, self.log)).run(),
                 procNext, deferred.reject);
            break;
          default:
            deferred.reject(
              new $taskerrors.MalformedPayloadError(
                "bad sub fanout type: " + subFanoutMsg.type));
            break;
        }
      }
      procNext();

      return deferred.promise;
    },
  },
});

/**
 * Retrieve the conversation invitation data if it's not already provided to us
 *  to both double-check the conversation exists but more importantly to get
 *  at the envelope crypto key.
 *
 * At the current time there is no useful information inside the
 *  sender's envelope (all the useful envelope stuff is in the fanout message),
 *  so this is sorta wasteful, but hey.
 *
 * We also grab:
 * - The current high message number.
 * - The list of all participants
 */
function commonLoadConversationRoot() {
  return this.store.getConversationRootMeta(this.convId);
}
const RE_PARTICIPANT = /^m:p/;
function commonProcessConversationRoot(cells) {
  if (!cells.hasOwnProperty("m:i"))
    throw new $taskerrors.MissingPrereqFatalError("no conversation root meta");

  this.highMessageNumber = parseInt(cells["m:m"]);

  // XXX we're skipping decrypting the envelop shared key for now since it's
  //  not needed.
  this.envelopeSharedSecretKey = null;

  var participants = this.participants = [];
  for (var key in cells) {
    if (!RE_PARTICIPANT.test(key))
      continue;
    participants.push(key.substring(3));
  }
}

/**
 * Join tasks differ from message tasks in that we need to generate additional
 *  datastore associations about the involvement of the added user to this
 *  conversation.
 */
var UserConvJoinTask = taskMaster.defineTask({
  name: "userConvJoin",
  args: ['effigy', 'store', 'uproc', 'convId',
         'fanoutMsg', 'fanoutNonce', 'fanoutMsgRaw', 'transitServerKey'],
  steps: {
    load_conversation_root: commonLoadConversationRoot,
    proc_conversation_root: commonProcessConversationRoot,
    persist: function() {
      this.replicaBlock = {
        nonce: this.fanoutNonce,
        fanmsg: this.fanoutMsgRaw,
        convId: this.convId,
        transit: this.transitServerKey,
      };
      var extraCells = {};
      extraCells["u:" + this.fanoutMsg.invitee] = 1;
      return this.store.addConversationMessage(
        this.convId,
        this.highMessageNumber,
        this.replicaBlock,
        extraCells);
    },
    relay_to_subscribed_clients: function() {
      return this.uproc.relayMessageToAllClients(this.replicaBlock);
    },
  },
});

var UserConvMessageTask = taskMaster.defineTask({
  name: "userConvMessage",
  args: ['effigy', 'store', 'uproc', 'convId',
         'fanoutMsg', 'fanoutNonce', 'fanoutMsgRaw', 'transitServerKey'],
  steps: {
    load_conversation_root: commonLoadConversationRoot,
    proc_conversation_root: commonProcessConversationRoot,
    persist: function() {
      this.replicaBlock = {
        nonce: this.fanoutNonce,
        fanmsg: this.fanoutMsgRaw,
        convId: this.convId,
        transit: this.transitServerKey,
      };
      return $Q.wait(null,
        this.store.addConversationMessage(this.convId,
                                          this.highMessageNumber,
                                          this.replicaBlock),
        this.store.touchConvPeepRecencies(this.convId,
                                          this.fanoutMsg.receivedAt,
                                          this.fanoutMsg.sentBy,
                                          this.participants)
      );
    },
    relay_to_subscribed_clients: function() {
      return this.uproc.relayMessageToAllClients(this.replicaBlock);
    },
  },
});

/**
 * A conversation (per-user) meta-message is payload-wise very similar to a
 *  content message, but is subject to replacement by a more recent message and
 *  is much less important from a delivery perspective.  Specifically, in the
 *  default case, the metadata would never generate a notification that would
 *  alert the user.  As such, there is little need to stream it to a device
 *  operating in a power/bandwidth-limited situation.
 */
var UserConvMetaTask = taskMaster.defineTask({
  name: "userConvMeta",
  steps: {
    // XXX yes, we should implement the metadata bit too!
    explode: function() {throw new Error("XXX I DID NOT DO THIS BIT YET");},
  },
});


}); // end define
