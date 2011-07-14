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
    './server',
    './ustore',
    'module',
    'exports'
  ],
  function(
    $Q,
    $log,
    $task, $taskerrors,
    $mailstore_server,
    $ustore,
    $module,
    exports
  ) {
var when = $Q.when;

var LOGFAB = exports.LOGFAB = $log.register($module, {
});

var taskMaster = $task.makeTaskMasterForModule($module, LOGFAB);

/**
 * MRU-persistent processor of messages for users that keeps around state so
 *  that we can process batches of data or bursty data without setup costs for
 *  every message.
 */
function UserMessageProcessor(effigy, dbConn, _logger) {
  this.effigy = effigy;
  this.store = new $ustore.UserBehalfDataStore(effigy.rootPublicKey,
                                               dbConn);
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
      effigy: this.effigy,
      store: this.store,
      uproc: this,
      convId: stransitEnv.convId,
      fanoutMsg: fanoutMsg,
      fanoutNonce: stransitEnv.nonce,
      fanoutMsgRaw: stransitEnv.payload,
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

  friendRequestForUser: function(innerEnv, senderKey, nonce, otherServerKey,
                                 receivedAt) {

  },

  /**
   * Enqueue the given replica block for all clients and notify connected
   *  clients so they can immediately process.
   *
   * XXX we want to narrow this to subscriptions and importance at some point,
   *  of course.
   */
  relayMessageToAllClients: function(block) {
    var clientKeys = this.effigy.otherClientKeys;
    var promises = [];
    for (var i = 0; i < clientKeys.length; i++) {
      promises.push(this.store.clientQueuePush(clientKeys[i], block));
    }

    $mailstore_server.gConnTracker.notifyAllOfReplicaBlock(
      this.effigy.rootPublicKey, block);

    return $Q.all(promises);
  },
};

function UserProcessorRegistry(serverConfig, dbConn, _logger) {
  this._config = serverConfig;
  this._db = dbConn;
  this._logger = _logger;

  this._procByTell = {};
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
      function(userEffigy) {
        var processor = new UserMessageProcessor(userEffigy, self._db,
                                                 self._logger);
        // save the processor in the table, overwriting the load promise
        self._procByTell[userEffigy] = processor;
        return processor;
      }
      // rejection pass-through
    );
    // put the promise in there for now to avoid multiple in-flights.
    this._procByTell[userTellKey] = promise;
    return promise;
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
  friendRequestForUser: function(innerEnv, senderKey, nonce, otherServerKey,
                                 receivedAt) {
    return when(this._getUserMessageProcessorUsingTellKey(stransitEnv.name),
                function(uproc) {
      return uproc.friendRequestForUser(innerEnv, senderKey, nonce,
                                        otherServerKey, receivedAt);
    });
  },
};

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
        {
          // we don't need the transit server's key, it's implicit
          nonce: this.fanoutNonce,
          msg: this.fanoutMsg
        }, extraCells);
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
