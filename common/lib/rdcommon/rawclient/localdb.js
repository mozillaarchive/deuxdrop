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
 * (A smart) client's local datastore consisting of local replicas of subsets of
 *  data whose canonical copies lives on the mailstore.  In some cases, such as
 *  peeps, we will have the entire dataset available locally.  In most other
 *  cases we will have recently new/updated, recently accessed, or marked as
 *  important subsets of data around.   Where data = conversations + messages.
 **/

define(
  [
    'q',
    'rdcommon/log',
    'rdcommon/taskidiom', 'rdcommon/taskerrors',
    'rdcommon/crypto/keyops',
    'rdcommon/identities/pubident', 'rdcommon/crypto/pubring',
    'rdcommon/messages/generator',
    './schema', './notifking', './lstasks',
    'module',
    'exports'
  ],
  function(
    $Q,
    $log,
    $task, $taskerrors,
    $keyops,
    $pubident, $pubring,
    $msg_gen,
    $lss, $notifking, $ls_tasks,
    $module,
    exports
  ) {
var when = $Q.when;

const PINNED = 'pinned';

const NS_PEEPS = 'peeps',
      NS_CONVBLURBS = 'convblurbs',
      NS_CONVMSGS = 'convmsgs',
      NS_SERVERS = 'servers',
      NS_CONNREQS = 'connreqs',
      NS_ERRORS = 'errors';

const setIndexValue = $notifking.setIndexValue,
      setReuseIndexValue = $notifking.setReuseIndexValue,
      transferIndexValue = $notifking.transferIndexValue,
      assertTransferIndexValue = $notifking.assertTransferIndexValue,
      getIndexValue = $notifking.getIndexValue,
      assertGetIndexValue = $notifking.assertGetIndexValue;

/**
 * An optimization we are capable of performing is that we do not have to store
 *  things in a particularly encrypted form.  This allows us to potentially
 *  save a lot of CPU/power.
 *
 * Our local storage implementation is targeting an IndexedDB-on-LevelDB
 *  implementation.
 *
 * Our implementation is problem domain aware to make things more readable and
 *  because previous efforts (gloda) have suggested the extra abstraction just
 *  proves confusing or never gets used.  This specifically means that when
 *  loading a conversation, we have the conversation loading code trigger the
 *  load of the related contacts, etc. rather than defining a more abstract
 *  schema or set of helper classes that try and magically do it for us.
 */
function LocalStore(dbConn, keyring, pubring, isFirstRun, _logger) {
  this._log = LOGFAB.localStore(this, _logger, null);

  this._db = dbConn;
  this._keyring = keyring;
  this._pubring = pubring;
  this._notif = new $notifking.NotificationKing(this, this._log);

  /**
   * The set of root keys of pinned peeps.
   */
  this._pinnedPeepRootKeys = null;

  // initialize the db schema and kickoff the bootstrap once the db is happy
  var self = this;
  when(this._db.defineSchema($lss.dbSchemaDef), function() {
    self._bootstrap(isFirstRun);
  });
}
exports.LocalStore = LocalStore;
LocalStore.prototype = {
  toString: function() {
    return '[LocalStore]';
  },
  toJSON: function() {
    return {type: 'LocalStore'};
  },

  //////////////////////////////////////////////////////////////////////////////
  // Bootstrap
  _bootstrap: function(isFirstRun) {
    // - load our list of pinned peeps by root key
    // XXX actually load after we actually support pinned peeps

    // populate our fake self-peep data that `saveOurOwnSelfIdents` doesn't
    //  address
    if (isFirstRun) {
      this._db.putCells($lss.TBL_PEEP_DATA, this._keyring.rootPublicKey, {
        'd:meta': {},
        'd:nunread': 0,
        'd:nconvs': 0,
      });
    }
  },

  //////////////////////////////////////////////////////////////////////////////
  // Replica API

  generateReplicaCryptoBlock: function(command, id, payload) {
    var block = {
      cmd: command,
      id: id,
      when: Date.now(),
      data: payload
    };
    var blockStr = JSON.stringify(block);
    var nonce = $keyops.makeSecretBoxNonce();
    var sboxed = this._keyring.secretBoxUtf8With(
                   blockStr, nonce, 'replicaSbox');
    return {nonce: nonce, sboxed: sboxed};
  },

  generateReplicaAuthBlock: function(command, id, payload) {
    var block = {
      cmd: command,
      id: id,
      when: Date.now(),
      data: payload
    };
    var blockStr = JSON.stringify(block);
    var authed = this._keyring.authUtf8With(blockStr, 'replicaAuth');
    return {block: blockStr, auth: authed};
  },

  /**
   * Consume and process one of the many varieties of replica blocks:
   * - crypted block issued by a client (trustworthy)
   * - authenticated block issued by a client (trustworthy)
   * - conversation data from the mailstore (needs validation of nougat)
   * - connect/contact request
   */
  consumeReplicaBlock: function(serialized) {
    // (we used to JSON.stringify, now we don't)
    var mform = serialized,
        authed, block;
    if (mform.hasOwnProperty("fanmsg")) {
      return this._proc_fanmsg(mform);
    }
    // explicitly typed, currently implies contact request
    else if(mform.hasOwnProperty("type")) {
      return this._proc_reqmsg(mform);
    }
    else {
      if (mform.hasOwnProperty("nonce")) {
        block = JSON.parse(this._keyring.openSecretBoxUtf8With(
                    mform.sboxed, mform.nonce, 'replicaSbox'));
      }
      else {
        this._keyring.verifyAuthUtf8With(mform.auth, mform.block,
                                         'replicaAuth');
        block = JSON.parse(mform.block);
      }
      return this._performReplicaCommand(block.cmd, block.id, block.data);
    }
  },

  /**
   * Perform a replica command.
   *
   * Note that we do not differentiate between whether the command came to us
   *  via a secret-boxed or authenticated block.
   */
  _performReplicaCommand: function(command, id, payload) {
    var implCmdName = "_cmd_" + command;
    if (!(implCmdName in this)) {
      throw new Error("no command for '" + block.cmd + "'");
    }
    return this._log.replicaCmd(command, this,
                                 this[implCmdName],
                                 id, payload);
  },

  generateAndPerformReplicaCryptoBlock: function(command, id, payload) {
    var serialized = this.generateReplicaCryptoBlock(command, id, payload);
    this._performReplicaCommand(command, id, payload);
    return serialized;
  },

  generateAndPerformReplicaAuthBlock: function(command, id, payload) {
    var serialized = this.generateReplicaAuthBlock(command, id, payload);
    this._performReplicaCommand(command, id, payload);
    return serialized;
  },

  /**
   * Notification from the client that the server has conveyed that we are
   *  caught up, and, accordingly, we can release any notifications we were
   *  batching up.
   */
  replicaCaughtUp: function() {
    this._notif.updatePhaseDoneReleaseNotifications();
  },

  //////////////////////////////////////////////////////////////////////////////
  // Notifications

  _notifyNewMessagesInConversation: function(convId, msgDataItems) {

  },

  /**
   * If there are any required dataDeps for the queryHandle, then retrieve them
   *  and re-run, otherwise send the query results.
   */
  _fillOutQueryDepsAndSend: function(queryHandle) {
    // fetch blurbs before peeps because blurbs can generate peep deps
    if (queryHandle.dataNeeded[NS_CONVBLURBS].length) {
      var convIds = queryHandle.dataNeeded[NS_CONVBLURBS].splice(0,
                      queryHandle.dataNeeded[NS_CONVBLURBS].length);
      return this._fetchAndReportConversationBlurbsById(query, convIds);
    }
    // fetch peep deps last-ish because they can't generate deps
    if (queryHandle.dataNeeded[NS_PEEPS].length) {
      var peepRootKeys = queryHandle.dataNeeded[NS_PEEPS].splice(0,
                           queryHandle.dataNeeded[NS_PEEPS].length);
      // we never pass index/indexparam because a query on peeps would always
      //  get its data directly, not by our dependency loading logic.
      return this._fetchAndReportPeepBlurbsById(queryHandle, null, null,
                                                peepRootKeys);
    }
    return this._notif.sendQueryResults(queryHandle);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Conversation Lookup

  _fetchAndReportConversationBlurbsById: function(queryHandle,
                                                  conversationIds) {
    var deferred = $Q.defer();
    var iConv = 0, self = this,
        viewItems = [];
    queryHandle.splices.push({
      index: 0, howMany: 0, items: viewItems,
    });
    function getNextMaybeGot() {
      while (iConv < conversationIds.length) {
        var convId = conversationIds[iConv], clientData;
        // - attempt cache re-use
        if ((clientData = self._notif.reuseIfAlreadyKnown(queryHandle,
                                                          NS_CONVBLURBS,
                                                          convId))) {
          viewItems.push(clientData.localName);
          iConv++;
          continue;
        }

        return when(self._fetchConversationBlurb(queryHandle,
                                                 conversationIds[iConv]),
                    function(clientData) {
          viewItems.push(clientData.localName);
          iConv++;
          return getNextMaybeGot();
        });
      }

      return self._fillOutQueryDepsAndSend(queryHandle);
    }

    return getNextMaybeGot();
  },

  /**
   * Retrieve a converation blurb from the datastore for inclusion in the
   *  provided query.  Only invoked after failing to retrieve the data from
   *  cache, and so always generates a new data structure.  The structure is
   *  immediately named and contributed to the members map prior to yielding
   *  control flow so that no duplicate loading occurs.
   */
  _fetchConversationBlurb: function(queryHandle, convId) {
    var querySource = queryHandle.owner;
    var localName = "" + (querySource.nextUniqueIdAlloc++);
    var deps = [];
    var clientData = {
      localName: localName,
      fullName: convId,
      count: 1,
      data: null,
      indexValues: [],
      deps: deps,
    };
    queryHandle.membersByLocal[NS_CONVBLURBS][localName] = clientData;
    queryHandle.membersByFull[NS_CONVBLURBS][convId] = clientData;

    return when(this._db.getRow($lss.TBL_CONV_DATA, convId, null),
                function(cells) {
      // we need the meta on our side...
      clientData.data = cells['d:meta'];

      // -- build the client rep
      queryHandle.dataMap[NS_CONVBLURBS][localName] =
        self._convertConversationBlurb(queryHandle, cells, deps);
      return clientData;
    });
  },

  /**
   * Create a send-to-moda-bridge wire representation representation of a
   *  conversation blurb given its cells.
   */
  _convertConversationBlurb: function(queryHandle, cells, deps) {
    var numMessages = cells['d:m'];
    var participants = [];

    // - first message, participants list
    var msg, iMsg, firstMsgRep = null, iFirstMsg = null;
    for (iMsg = 1; iMsg <= numMessages; iMsg++) {
      msg = cells['d:m' + iMsg];
      if (!iFirstMsg && msg.type === 'message') {
        firstMsgRep = {
          type: 'message',
          author: this._deferringPeepQueryResolve(queryHandle, msg.authorId,
                                                  deps),
          composedAt: msg.composedAt,
          receivedAt: msg.receivedAt,
          text: msg.text,
        };
        iFirstMsg = iMsg;
      }
      else if (msg.type === 'join') {
        participants.push(this._deferringPeepQueryResolve(queryHandle,
                                                          msg.id,
                                                          deps));
      }
    }
    if (!iFirstMsg)
      iFirstMsg = 1;

    // - number of unread
    // XXX unread status not yet dealt with. pragmatism!
    var numUnreadTextMessages = 1, firstUnreadMsgRep = null;
    for (iMsg = iFirstMsg; iMsg <= numMessages; iMsg++) {
      msg = cells['d:m' + iMsg];
      if (msg.type === 'message') {
        numUnreadTextMessages++;
        // - first unread (non-join) message...
        if (!firstUnreadMsgRep) {
          firstUnreadMsgRep = {
            type: 'message',
            author: this._deferringPeepQueryResolve(queryHandle, msg.authorId,
                                                    deps),
            composedAt: msg.composedAt,
            receivedAt: msg.receivedAt,
            text: msg.text,
          };
        }
      }
    }

    return {
      participants: participants,
      firstMessage: firstMsgRep,
      firstUnreadMessage: firstUnreadMsgRep,
      pinned: false,
      numUnread: numUnreadTextMessages,
    };
  },

  /**
   * Create a send-to-moda-bridge wire delta representation for changes to a
   *  converstaion blurb given the changed hbase cells.
   */
  _convertConversationBlurbDelta: function(queryHandle, clientData, outDeltaRep,
                                           cells, mutatedCells) {
    for (var key in mutatedCells) {
      // - participants
      if (/^d:p/.test(key)) {
        if (!outDeltaRep.hasOwnProperty("participants"))
          outDeltaRep.participants = [];
        outDeltaRep.participants.push(
          this._deferringPeepQueryResolve(queryHandle, mutatedCells[key],
                                          clientData.deps));
      }
    }
    // - If this is our first human message, populate.
    var msgNum = mutatedCells['d:m'], msgRec = mutatedCells['d:m' + msgNum];
    // XXX skimping on checking if this is the first; let's just always send
    //  the message for now and have the bridge ignore it if it's alreayd got
    //  one.
    if (msgRec.type === 'message') {
      outDeltaRep.firstMessage = {
        type: 'message',
        author: this._deferringPeepQueryResolve(queryHandle, msgRec.authorId,
                                                clientData.deps),
        composedAt: msgRec.composedAt,
        receivedAt: msgRec.receivedAt,
        text: msgRec.text,
      };
    }

    // - If we have no unread messages, and this is unread...
    // XXX unread logic; will get complicated in the 'takeback' if we get a meta
    //  in the same update phase that says we've actually read that message.
  },

  /**
   * Derive the current set of index values for the peep index parameter
   *  for a conversation.  This is used when a peep joins a conversation and we
   *  need the index values that otherwise would require a database lookup.
   */
  _rederiveConversationPeepIndices: function(convId, cells, peepRootKey) {
    var highNum = cells['d:m'];

    var write = null, recip = null, any = null;
    for (var i = 1; i <= highNum; i++) {
      var msgRec = cells['d:m' + i];

      any = msgRec.receivedAt;
      switch (msgRec.type) {
        case 'message':
          if (msgRec.authorId === peepRootKey)
            write = msgRec.receivedAt;
          else
            recip = msgRec.receivedAt;
          break;
      }
    }

    return [
      [$lss.IDX_CONV_PEEP_WRITE_INVOLVEMENT, peepRootKey, null, write],
      [$lss.IDX_CONV_PEEP_RECIP_INVOLVEMENT, peepRootKey, null, recip],
      [$lss.IDX_CONV_PEEP_ANY_INVOLVEMENT, peepRootKey, null, any]
    ];
  },

  /**
   * Notification about a new conversation; we check if there are any affected
   *  conversation queries and if so perform the required contact
   *  lookup/dependency generation.
   *
   * We are notified about conversations once our user is joined to them.
   */
  _notifyNewConversation: function(convId, cells, mutatedCells,
                                   indexValues) {
    var mergedCells = null, self = this;
    this._notif.namespaceItemAdded(
      NS_CONVBLURBS, convId, cells, mutatedCells, indexValues,
      function buildReps(clientData, queryHandle) {
        if (!mergedCells) // merge only the first time needed
          mergedCells = $notifking.mergeCells(baseCells, mutatedCells);
        // back data
        clientData.data = mergedCells['d:meta'];
        return self._convertConversationBlurb(
          queryHandle, mergedCells, clientData.deps
        );
      });
  },

  /**
   * Notification about a modified conversation.
   */
  _notifyModifiedConversation: function(convId, cells, mutatedCells,
                                        updatedIndexValues) {
    var mergedCells = null, self = this;
    this._notif.namespaceItemModified(
      NS_CONVBLURBS, convId, cells, mutatedCells, updatedIndexValues,
      function genFullReps(clientData, queryHandle) {
        if (!mergedCells) // merge only the first time needed
          mergedCells = $notifking.mergeCells(cells, mutatedCells);
        // back data
        clientData.data = mergedCells['d:meta'];
        return self._convertConversationBlurb(
          queryHandle, mergedCells, clientData.deps
        );
      },
      function genDeltaReps(clientData, queryHandle, outDeltaRep) {
        // no change to the backside rep is required beause we don't need the
        //  set of participants under our current shared-key-per-conversation
        //  crypto key setup.  If the crypto changes, this may change.
        return self._convertConversationBlurbDelta(
          queryHandle, clientData, outDeltaRep, cells, mutatedCells);
      });
  },


  queryConversationMessages: function(queryHandle, convId) {
    // - Loop the blurb in for GC purposes
    // (Specifically, we want to be able to have the messages reference the
    //  blurb, so we want to include the blurb as part of our dependent data.
    //  Because we only allow this query to be created from an existing blurb,
    //  we can rely on the blurb already being known to the bridge and explode
    //  if it somehow is no longer known.)
    var blurbClientData = this._notif.reuseIfAlreadyKnown(
                            queryHandle, NS_CONVBLURBS, convId);
    if (!blurbClientData) {
      throw this._notifking.badQuery(queryHandle, "Conv blurb does not exist!");
    }

    // - does the bridge already know the answer to the question?
    var msgsClientData = this._notif.reuseIfAlreadyKnown(
                           queryHandle, NS_CONVMSGS, convId);
    if (msgsClientData) {
      this._fillOutQueryDepsAndSend(queryHandle);
      return;
    }

    // - need to fetch the data
    this._fetchConversationMessages(queryHandle, convId);
  },

  /**
   * Convert message records (as pulled from or pushed to hbase) into wire
   *  representations to send to the moda bridge.
   *
   * If you change this method, you need to also change
   *  `_fetchConversationBlurb` which currently inlines the same
   *  transformations.
   */
  _convertConversationMessages: function(queryHandle, msgRecs, deps) {
    var messages = [];
    for (var i = 0; i < msgRecs.length; i++) {
      var msg = msgRecs[i];
      if (msg.type === 'message') {
        messages.push({
          type: 'message',
          author: this._deferringPeepQueryResolve(queryHandle, msg.authorId,
                                                  deps),
          composedAt: msg.composedAt,
          receivedAt: msg.receivedAt,
          text: msg.text,
        });
        break;
      }
      else if (msg.type === 'join') {
        messages.push({
          type: 'join',
          inviter: this._deferringPeepQueryResolve(queryHandle, msg.by, deps),
          invitee: this._deferringPeepQueryResolve(queryHandle, msg.id, deps),
          receivedAt: msg.receivedAt,
          text: msg.text,
        });
      }
      else {
        throw new Error("Unknown message type '" + msg.type + "'");
      }
    }
    return messages;
  },

  /**
   * Retrieve conversation messages and data that impacts the messages, such
   *  as high-water marks and metadata about the messages.  We do not need
   *  to retrieve the information that's already known to the blurb, or we can
   *  ignore it at least.
   *
   * Only invoked on cache miss, so creates a new clientData data structure that
   *  is immediately linked into our rep.
   *
   * Issues query send on completion.
   */
  _fetchConversationMessages: function(queryHandle, convId) {
    var querySource = queryHandle.owner;
    var localName = "" + (querySource.nextUniqueIdAlloc++);
    var deps = [];
    var clientData = {
      localName: localName,
      fullName: convId,
      count: 1,
      // we don't need to maintain any data about the messages; only the blurb
      //  needs it because the blurb is what gets acted upon
      data: null,
      // we don't need any indices because the messages are inherently ordered
      //  and cannot be reordered.
      indexValues: null,
      deps: deps,
    };
    queryHandle.membersByLocal[NS_CONVMSGS][localName] = clientData;
    queryHandle.membersByFull[NS_CONVMSGS][convId] = clientData;

    var self = this;
    return when(this._db.getRow($lss.TBL_CONV_DATA, convId, null),
                function(cells) {
      // -- build the client rep
      var numMessages = cells['d:m'];

      // - all messages
      var msgRecs = [];
      for (var iMsg = 1; iMsg <= numMessages; iMsg++) {
        msgRecs.push(cells['d:m' + iMsg]);
      }

      queryHandle.dataMap[NS_CONVMSGS][localName] = {
        messages: self._convertConversationMessages(queryHandle, msgRecs, deps),
      };

      return self._fillOutQueryDepsAndSend(queryHandle);
    });
  },

  /**
   * Get the list of conversations a user is involved with.
   *
   * @args[
   *   @param[peep]
   *   @param[query @dict[
   *     @key[involvement @oneof['any' 'recip' 'write']]
   *   ]]
   * ]
   */
  queryAndWatchPeepConversationBlurbs: function(queryHandle, peepRootKey) {
    // pick the index to use
    var index;
    switch (queryHandle.queryDef.by) {
      case 'any':
        index = $lss.IDX_CONV_PEEP_ANY_INVOLVEMENT;
        break;
      case 'recip':
        index = $lss.IDX_CONV_PEEP_RECIP_INVOLVEMENT;
        break;
      case 'write':
        index = $lss.IDX_CONV_PEEP_WRITE_INVOLVEMENT;
        break;
      default:
        throw new Error("bad ordering ('by'): '" +
                        queryHandle.queryDef.by + "'");
    }
    queryHandle.index = index;
    queryHandle.indexParam = peepRootKey;

    // comparison predicate is keyed off the index
    queryHandle.cmpFunc = function(aClientData, bClientData) {
      var aVal = assertGetIndexValue(aClientData.indexValues,
                                     index, peepRootKey),
          bVal = assertGetIndexValue(aClientData.indexValues,
                                     index, peepRootKey);
      return aVal - bVal;
    };

    // test predicate is keyed off the presence of the peep in the conversation
    queryHandle.testFunc = function(baseCells, mutatedCells, convId) {
      var key;
      // We can because we don't know their tell key right here, and eventually
      //  there might be multiple tell keys.  This is not super-great efficient.
      //  Before optimizing this too much, it would likely be worth creating
      //  a variant on the test function that is incremental and so would
      //  only check out mutatedCells...
      for (key in mutatedCells) {
        if (/^d:p/.test(key) && mutatedCells[key] === peepRootKey)
          return true;
      }
      for (key in baseCells) {
        if (/^d:p/.test(key) && baseCells[key] === peepRootKey)
          return true;
      }
      return false;
    };

    // - generate an index scan, netting us the conversation id's, hand-off
    return when(this._db.scanIndex($lss.TBL_CONV_DATA, index, peepRootKey, -1,
                                   null, null, null, null, null, null),
      this._fetchAndReportConversationBlurbsById.bind(this, queryHandle));
  },


  //////////////////////////////////////////////////////////////////////////////
  // Index Updating
  //
  // We potentially maintain a lot of indices, and the code gets very dry,
  //  so we centralize it.

  /**
   * Update peep (write/recip/any) and conversation indices (global and
   *  per-peep, including pinned variants).  We do this for both join
   *  and 'human message' messages.
   */
  _makeConvIndexUpdates: function(convId, convPinned, convUpdates, peepMaxes,
                                  authorRootKey, recipRootKeys, timestamp) {
    var authorIsOurUser = (authorRootKey === this._keyring.rootPublicKey);
    // - global conversation list
    convUpdates.push([$lss.IDX_ALL_CONVS, '', convId, timestamp]);
    // - global pinned conversation list
    if (convPinned)
      convUpdates.push([$lss.IDX_ALL_CONVS, PINNED, convId, timestamp]);

    // - per-peep write/any involvement for the author
    if (!authorIsOurUser) {
      peepMaxes.push([$lss.IDX_PEEP_WRITE_INVOLVEMENT, '',
                      authorRootKey, timestamp]);
      peepMaxes.push([$lss.IDX_PEEP_ANY_INVOLVEMENT, '',
                      authorRootKey, timestamp]);
    }
    // XXX pinned peep; need to know they are pinned. ughs.

    convUpdates.push([$lss.IDX_CONV_PEEP_WRITE_INVOLVEMENT, authorRootKey,
                  convId, timestamp]);
    convUpdates.push([$lss.IDX_CONV_PEEP_ANY_INVOLVEMENT, authorRootKey,
                  convId, timestamp]);

    // - per-peep (maybe recip)/any involvement for the recipients
    for (var iRecip = 0; iRecip < recipRootKeys.length; iRecip++) {
      var rootKey = recipRootKeys[iRecip];
      // - boost any involvement
      peepMaxes.push([$lss.IDX_PEEP_ANY_INVOLVEMENT, '', rootKey, timestamp]);

      convUpdates.push([$lss.IDX_CONV_PEEP_ANY_INVOLVEMENT, rootKey,
                    convId, timestamp]);
      // - boost recip involvement
      if (authorIsOurUser) {
        peepMaxes.push([$lss.IDX_PEEP_RECIP_INVOLVEMENT, '',
                        rootKey, timestamp]);

        convUpdates.push([$lss.IDX_CONV_PEEP_RECIP_INVOLVEMENT, rootKey,
                      convId, timestamp]);
      }
    }
  },

  //////////////////////////////////////////////////////////////////////////////
  // Contact Requests

  _proc_reqmsg: function(reqmsg) {
    // - open the inner envelope
    var reqEnv = JSON.parse(
      this._keyring.openBoxUtf8With(reqmsg.innerEnvelope.envelope, reqmsg.nonce,
                                    reqmsg.senderKey,
                                    'messaging', 'envelopeBox'));
    if (!reqEnv.hasOwnProperty('type') ||
        reqEnv.type !== 'contactRequest')
      throw new $taskerrors.MalformedOrReplayPayloadError(
        "request type is '" + reqEnv.type + "' instead of 'contactRequest'");

    // - open the body
    var reqBody = JSON.parse(
      this._keyring.openBoxUtf8With(reqEnv.body, reqmsg.nonce,
                                    reqmsg.senderKey,
                                    'messaging', 'bodyBox'));

    // - validate the enclosed self-ident matches the sender key
    var othSelfIdentPayload = $pubident.assertGetPersonSelfIdent(
                                reqBody.selfIdent);
    var othPubring = $pubring.createPersonPubringFromSelfIdentDO_NOT_VERIFY(
                       reqBody.selfIdent);
    if (othPubring.getPublicKeyFor('messaging', 'tellBox') !== reqmsg.senderKey)
      throw new $taskerrors.SelfIdentKeyMismatchError(
        "self-ident inconsistent with sender of connect request");

    // - validate they enclosed a vaid other person ident for us
    var theirOthIdentOfUsPayload = $pubident.assertGetOtherPersonIdent(
                                     reqBody.otherPersonIdent, othPubring,
                                     reqmsg.receivedAt);
    // (we know it's of us because the root key will be checked against ours)
    var enclosedSelfIdentPayload = $pubident.assertGetPersonSelfIdent(
                                     theirOthIdentOfUsPayload.personSelfIdent,
                                     this._keyring.rootPublicKey);
    var theirPocoForUs = theirOthIdentOfUsPayload.localPoco;

    // - build persisted rep
    var persistRep = {
      selfIdent: reqBody.selfIdent,
      receivedAt: reqmsg.receivedAt,
      theirPocoForUs: theirPocoForUs,
      messageText: reqBody.messageText,
    };
    var cells = {'d:req': persistRep};
    var indexValues = [
      [$lss.IDX_CONNREQ_RECEIVED, '',
       othPubring.rootPublicKey, reqmsg.receivedAt],
    ];

    // - persist
    // We key the record by the sender's root key.  The other possibility would
    //  be to use their tell key, which might be a better idea because the
    //  duplicate suppression is keyed off of the tell key rather than the
    //  root key.
    var self = this;
    return when($Q.wait(
        this._db.putCells($lss.TBL_CONNREQ_DATA, othPubring.rootPublicKey,
                          cells),
        this._db.updateMultipleIndexValues($lss.TBL_CONNREQ_DATA,
                                           indexValues)
      ),
      function() {
        // - notify
        self._notif.namespaceItemAdded(
          NS_CONNREQS, othPubring.rootPublicKey, cells, null, indexValues,
          function(clientData, queryHandle) {
            return self._convertConnectRequest(
              persistRep, othPubring.rootPublicKey, queryHandle, clientData);
          });
        self._log.contactRequest(reqmsg.senderKey);
      }); // rejection pass-through is fine
  },

  _convertConnectRequest: function(reqRep, fullName, queryHandle, clientData) {
    // our direct representation has nothing in it, nothing to do.

    // - synthesize the peep rep
    var peepClientData = this._notif.reuseIfAlreadyKnown(
                           queryHandle, NS_PEEPS, fullName);
    if (!peepClientData) {
      var localName = "" + (queryHandle.owner.nextUniqueIdAlloc++);
      peepClientData = {
        localName: localName,
        fullName: fullName,
        count: 1,
        data: null,
        indexValues: [],
        deps: [],
      };
      var selfIdentPayload = $pubident.peekPersonSelfIdentNOVERIFY(
                               reqRep.selfIdent);
      var frontData = this._convertPeepSelfIdentToBothReps(
                        reqRep.selfIdent, selfIdentPayload, peepClientData);

      queryHandle.membersByLocal[NS_PEEPS][localName] = peepClientData;
      queryHandle.membersByFull[NS_PEEPS][fullName] = peepClientData;

      queryHandle.dataMap[NS_PEEPS][localName] = frontData;
    }
    clientData.deps.push(peepClientData);

    return {
      peepLocalName: peepClientData.localName,
      theirPocoForUs: reqRep.theirPocoForUs,
      receivedAt: reqRep.receivedAt,
      messageText: reqRep.messageText,
    };
  },

  queryAndWatchConnRequests: function(queryHandle) {
    var self = this, querySource = queryHandle.owner;
    queryHandle.index = $lss.IDX_CONNREQ_RECEIVED;
    queryHandle.indexParam = '';
    queryHandle.testFunc = function() {
      return true;
    };
    queryHandle.cmpFunc = function(a, b) {
      return b.receivedAt - a.receivedAt;
    };
    return when(this._db.scanIndex(
                  $lss.TBL_CONNREQ_DATA, $lss.IDX_CONNREQ_RECEIVED, '', -1),
      function(results) {
        var rootKeys = [];
        for (var iRes = 0; iRes < results.length; iRes += 2) {
          rootKeys.push(results[iRes]);
        }

        var viewItems = [],
            clientDataItems = queryHandle.items = [];
        queryHandle.splices.push({index: 0, howMany: 0, items: viewItems});

        var iKey = 0;
        function getNextMaybeGot(reqRep) {
          var clientData;
          if (reqRep) {
            var localName = "" + (querySource.nextUniqueIdAlloc++),
                fullName = rootKeys[iKey - 1]; // (infinite loop protection)
            clientData = {
              localName: localName,
              fullName: fullName,
              count: 1,
              data: null,
              indexValues: [],
              deps: [],
            };
            queryHandle.membersByLocal[NS_CONNREQS][localName] = clientData;
            queryHandle.membersByFull[NS_CONNREQS][fullName] = clientData;

            queryHandle.dataMap[NS_CONNREQS][localName] =
              self._convertConnectRequest(reqRep, fullName,
                                          queryHandle, clientData);
            viewItems.push(localName);
            clientDataItems.push(clientData);
            reqRep = null;
          }
          // (use a while loop so in the event this is a duplicate conn req
          //  query our reuse invocations can fast-path without blowing the
          //  stack on non-tail-call optimized impls.)
          while (iKey < rootKeys.length) {
            if ((clientData = self._notif.reuseIfAlreadyKnown(
                                queryHandle, NS_CONNREQS, rootKeys[iKey]))) {
              viewItems.push(clientData.localName);
              clientDataItems.push(clientData);
              iKey++;
              continue;
            }

            // increment every time to avoid ending up in an infinite loop
            //  in case of data invariant violation
            return when(self._db.getRowCell($lss.TBL_CONNREQ_DATA,
                                            rootKeys[iKey++], 'd:req'),
                        getNextMaybeGot);
          }
          return self._fillOutQueryDepsAndSend(queryHandle);
        }

        return getNextMaybeGot();
      }); // rejection pass-through is desired
  },

  //////////////////////////////////////////////////////////////////////////////
  // Conversation Processing

  /**
   * Process a conversation fan-out message, delegating to the appropriate task.
   */
  _proc_fanmsg: function(fanmsg) {
    // -- invite?
    // (This gets to be the root of the conversation on the mailstore; it comes
    //  from the welcome message, which, for consistency reasons, the mailstore
    //  breaks apart and pretends does not exist to us.)
    if (fanmsg.hasOwnProperty("sentBy")) {
      return (new $ls_tasks.ConvInviteTask({store: this, fanmsg: fanmsg},
                                          this._log)).run();
    }
    // -- fanout message
    else {
      // - decrypt fanout envelope (transit server to our envelope key)
      var fanoutEnv = JSON.parse(
        this._keyring.openBoxUtf8With(fanmsg.fanmsg, fanmsg.nonce,
                                      fanmsg.transit,
                                      'messaging', 'envelopeBox'));

      var self = this;
      // just grab all the cells; XXX timecopout caching/unification
      return when(this._db.getRow($lss.TBL_CONV_DATA, fanmsg.convId, "d"),
                  function(cells) {
        if (!cells.hasOwnProperty("d:meta"))
          throw new $taskerrors.MissingPrereqFatalError();
        var convMeta = cells["d:meta"];

        var arg = {
          store: self,
          convMeta: convMeta,
          fanoutEnv: fanoutEnv,
          cells: cells,
        };
        var taskClass;
        switch(fanoutEnv.type) {
          case 'join':
            return (new $ls_tasks.ConvJoinTask(arg, self._log)).run();
            break;
          case 'message':
            return (new $ls_tasks.ConvMessageTask(arg, self._log)).run();
            break;
          case 'meta':
            return (new $ls_tasks.ConvMetaTask(arg, self._log)).run();
            break;
          default:
            throw new $taskerrors.MalformedPayloadError(
                        'bad type: ' + fanoutEnv.type);
        }
      });
    }
  },

  _cmd_convCreate: function() {

  },

  /**
   * Our own meta-data about a conversation (pinned, etc.)
   */
  _cmd_setConvMeta: function() {
    // -- update any subscribed queries on pinned
    // -- update any blurbs for this conversation
  },

  /**
   * Our user has composed a message to a conversation; track it for UI display
   *  but be ready to nuke it when the actual message successfully hits the
   *  conversation.
   */
  /*
  _cmd_outghostAddConversationMessage: function() {
  },
  */

  //////////////////////////////////////////////////////////////////////////////
  // Peep Lookup

  /**
   * Return true if the cells indicate the peep is a contact.
   */
  _testfunc_peepContactNoFilter: function(baseCells, mutatedCells) {
    // if the mutated cell has oident, then it is either an addition/deletion
    if (mutatedCells.hasOwnProperty('d:oident')) {
      return mutatedCells['d:oident'] !== null;
    }
    else if (baseCells.hasOwnProperty('d:oident')) {
      return baseCells['d:oident'] !== null;
    }
    return false;
  },

  /**
   * Return true if the cells indicate the peep is a pinned contact.  Being
   *  pinned implies being a contact, so we only need to do that check.  The
   *  pinned status is tracked in the general metadata blob, d:meta, which is
   *  atomically updated.
   */
  _testfunc_peepContactPinnedFilter: function(baseCells, mutatedCells) {
    if (mutatedCells.hasOwnProperty('d:meta')) {
      return mutatedCells['d:meta'].pinned;
    }
    else if (baseCells.hasOwnProperty('d:meta')) {
      return baseCells['d:meta'].pinned;
    }
    return false;
  },

  /**
   * Return a list of all the root keys belonging to our contacts.  This is
   *  intended for use to easily perform intersections between list of peeps
   *  found elsewhere and our current set of contacts.  It may make sense to
   *  replace this with a higher level API.
   */
  getRootKeysForAllContacts: function() {
    return when(this._db.scanIndex($lss.TBL_PEEP_DATA,
                                   $lss.IDX_PEEP_ANY_INVOLVEMENT, '',
                                   -1),
      function(rootKeysWithScores) {
        var rootKeys = [];
        for (var i = 0; i < rootKeysWithScores.length; i += 2) {
          rootKeys.push(rootKeysWithScores[i]);
        }
        return rootKeys;
      }); // failure pass-through is fine
  },

  queryAndWatchPeepBlurbs: function(queryHandle) {
    var idx, scanFunc = 'scanIndex', scanDir = -1, indexParam;
    switch (queryHandle.queryDef.by) {
      case 'alphabet':
        idx = $lss.IDX_PEEP_CONTACT_NAME;
        scanFunc = 'scanStringIndex';
        scanDir = 1;
        queryHandle.cmpFunc = this._cmpfunc_peepContactName;
        break;
      case 'any':
        idx = $lss.IDX_PEEP_ANY_INVOLVEMENT;
        queryHandle.cmpFunc = this._cmpfunc_peepAnyInvolvement;
        break;
      case 'recip':
        idx = $lss.IDX_PEEP_RECIP_INVOLVEMENT;
        queryHandle.cmpFunc = this._cmpfunc_peepRecipInvolvement;
        break;
      case 'write':
        idx = $lss.IDX_PEEP_WRITE_INVOLVEMENT;
        queryHandle.cmpFunc = this._cmpfunc_peepWriteInvolvement;
        break;
      default:
        throw new Error("Unsupported ordering: " + queryHandle.queryDef.by);
    }
    queryHandle.index = idx;

    switch (queryHandle.queryDef.filter) {
      case undefined:
      case null:
        indexParam = '';
        queryHandle.testFunc = this._testfunc_peepContactNoFilter;
        break;
      case 'pinned':
        indexParam = 'pinned';
        queryHandle.testFunc = this._testfunc_peepContactPinnedFilter;
        break;
      default:
        throw new Error("Unsupported filter: " + queryHandle.queryDef.filter);
    }
    queryHandle.indexParam = indexParam;

    if (idx === 'alphabet') {
      queryHandle.cmpFunc = function(aClientData, bClientData) {
        var aVal = assertGetIndexValue(aClientData.indexValues, idx, indexParam),
            bVal = assertGetIndexValue(aClientData.indexValues, idx, indexParam);
        return aVal.localCompare(bVal);
      };
    }
    else {
      queryHandle.cmpFunc = function(aClientData, bClientData) {
        var aVal = assertGetIndexValue(aClientData.indexValues, idx, indexParam),
            bVal = assertGetIndexValue(aClientData.indexValues, idx, indexParam);
        return aVal - bVal;
      };
    }

    return when(this._db[scanFunc]($lss.TBL_PEEP_DATA, idx, indexParam, scanDir,
                                   null, null, null, null, null, null),
      this._fetchAndReportPeepBlurbsById.bind(this, queryHandle,
                                              idx, indexParam));
  },

  /**
   * Convert a peep hbase representation into our reps.
   */
  _convertPeepToBothReps: function(baseCells, mutatedCells, clientData) {
    var cells = mutatedCells ? $notifking.mergeCells(baseCells, mutatedCells)
                             : baseCells;
    var signedOident = cells.hasOwnProperty('d:oident') ?
                         cells['d:oident'] : null;
    clientData.data = {
      oident: signedOident,
      sident: cells['d:sident'],
      numConvs: cells['d:nconvs'],
    };

    // -- client data
    var ourPoco = signedOident ?
      $pubident.peekOtherPersonIdentNOVERIFY(signedOident).localPoco : null;

    var selfPoco =
      $pubident.peekPersonSelfIdentNOVERIFY(cells['d:sident']).poco;
    return {
      ourPoco: ourPoco,
      selfPoco: selfPoco,
      numUnread: cells['d:nunread'],
      numConvs: cells['d:nconvs'],
      pinned: false,
    };
  },

  /**
   * Like `_convertPeepToBothReps` but intended for contact requests and
   *  friend-finding excursions where the only representation we have is the
   *  self-ident blob.
   */
  _convertPeepSelfIdentToBothReps: function(selfIdentBlob, selfIdentPayload,
                                             clientData) {
    clientData.data = {
      oident: null,
      sident: selfIdentBlob,
      numConvs: 0,
    };
    return {
      ourPoco: null,
      selfPoco: selfIdentPayload.poco,
      numUnread: 0,
      numConvs: 0,
      pinned: false,
    };
  },

  _notifyNewContact: function(peepRootKey, cells, mutatedCells, ourPoco) {
    // XXX this construction is sorta synthetic and redundant; the only actual
    //  update is the string one and it happens in `PeepNameTrackTask`.
    var indexValues = [];
    indexValues.push([$lss.IDX_PEEP_CONTACT_NAME, '',
                      peepRootKey, ourPoco.displayName]);
    // XXX we probably need to perform a lookup to populate these, since
    //  the values should already exist, etc.  Using 'now' as a stop-gap
    //  ordering value that is vaguely reasonable but still not right.
    var now = Date.now();
    indexValues.push([$lss.IDX_PEEP_ANY_INVOLVEMENT, '',
                      peepRootKey, now]);
    indexValues.push([$lss.IDX_PEEP_RECIP_INVOLVEMENT, '',
                      peepRootKey, now]);
    indexValues.push([$lss.IDX_PEEP_WRITE_INVOLVEMENT, '',
                      peepRootKey, now]);

    // -- generate the notification
    this._notif.namespaceItemAdded(
      NS_PEEPS, peepRootKey, cells, mutatedCells, indexValues,
      this._convertPeepToBothReps.bind(this, cells, mutatedCells));
  },

  _notifyPeepConvDeltas: function(authorRootKey, recipRootKeys,
                                  peepIndexValues,
                                  inviteeRootKey, inviteeDeltaRep) {
    // - notify for the author
    this._notif.namespaceItemModified(
      NS_PEEPS, authorRootKey, null, null, peepIndexValues);
    // - notify for the invitee with a delta if we have
    if (inviteeRootKey) {
      this._notif.namespaceItemModified(
        NS_PEEPS, inviteeRootKey, null, null, peepIndexValues, null,
        function deltaGen(clientData, queryHandle, outDeltaRep) {
          if (inviteeDeltaRep.hasOwnProperty('numConvs')) {
            // this function only gets invoked once per query source, so it's
            //  fine and won't screw up and increment several times.
            clientData.data.numConvs += inviteeDeltaRep.numConvs;
            // (it's okay to clobber this since we maintain an absolute count
            //  in clientData.data.)
            outDeltaRep.numConvs = clientData.data.numConvs;
          }
          return outDeltaRep;
        });
    }
    // - notify for the recipients
    for (var i = 0; i < recipRootKeys.length; i++) {
      var rootKey = recipRootKeys[i];
      if (rootKey !== inviteeRootKey) {
        this._notif.namespaceItemModified(
          NS_PEEPS, recipRootKeys[i], null, null, peepIndexValues);
      }
    }
  },

  _fetchAndReportPeepBlurbsById: function(queryHandle, usingIndex, indexParam,
                                          peepRootKeys) {
    var deferred = $Q.defer();
    var iPeep = 0, stride = 1, self = this,
        viewItems = [], clientDataItems = null;

    if (usingIndex) {
      queryHandle.items = clientDataItems = [];
      queryHandle.splices.push({index: 0, howMany: 0, items: viewItems});
      stride = 2;
    }
    function getNextMaybeGot() {
      while (iPeep < peepRootKeys.length) {
        var peepRootKey = peepRootKeys[iPeep], clientData;
        // - perform cache lookup, reuse only if valid
        // (_deferringPeepQueryResolve creates speculative entries and we are
        //  the logic that actually fulfills them.)
        if ((clientData = self._notif.reuseIfAlreadyKnown(queryHandle,
                                                          NS_PEEPS,
                                                          peepRootKey))) {
          if (clientData.data) {
            if (usingIndex) {
              setIndexValue(clientData.indexValues, usingIndex, indexParam,
                            peepRootKeys[iPeep + 1]);
            }
            viewItems.push(clientData.localName);
            if (clientDataItems)
              clientDataItems.push(clientData);
            iPeep += stride;
            continue;
          }
        }

        return when(self._fetchPeepBlurb(queryHandle, peepRootKeys[iPeep],
                                         clientData),
                    function(resultClientData) {
          if (usingIndex) {
            setIndexValue(clientData.indexValues, usingIndex, indexParam,
                          peepRootKeys[iPeep + 1]);
          }
          viewItems.push(resultClientData.localName);
          if (clientDataItems)
            clientDataItems.push(resultClientData);
          iPeep += stride;
          getNextMaybeGot();
        });
      }

      return self._fillOutQueryDepsAndSend(queryHandle);
    }

    return getNextMaybeGot();
  },

  _fetchPeepBlurb: function(queryHandle, peepRootKey, clientData) {
    // if we don't already have a data-empty structure, create one
    if (!clientData) {
      var querySource = queryHandle.owner;
      var localName = "" + (querySource.nextUniqueIdAlloc++);
      clientData = {
        localName: localName,
        fullName: peepRootKey,
        count: 1,
        data: null,
        indexValues: [],
        deps: null,
      };
      queryHandle.membersByLocal[NS_PEEPS][localName] = clientData;
      queryHandle.membersByFull[NS_PEEPS][peepRootKey] = clientData;
    }
    var self = this;
    return when(this._db.getRow($lss.TBL_PEEP_DATA, peepRootKey, null),
                function(cells) {
      queryHandle.dataMap[NS_PEEPS][clientData.localName] =
                    self._convertPeepToBothReps(cells, null, clientData);
      return clientData;
    });
  },

  /**
   * Resolve the peepRootKey to a local name for the given handle, adding it
   *  to the list of records to look up during the appropriate batch phase if
   *  not already known.
   */
  _deferringPeepQueryResolve: function(queryHandle, peepRootKey, addToDeps) {
    var fullMap = queryHandle.membersByFull[NS_PEEPS],
        clientData = this._notif.reuseIfAlreadyKnown(queryHandle, NS_PEEPS,
                                                     peepRootKey);
    if (clientData)
      return clientData.localName;

    queryHandle.dataNeeded[NS_PEEPS].push(peepRootKey);
    var localName = "" + (queryHandle.owner.nextUniqueIdAlloc++);
    clientData = {
      localName: localName,
      fullName: peepRootKey,
      count: 1,
      data: null,
      indexValues: [],
      deps: null, // peeps have no additional deps
    };
    queryHandle.membersByLocal[NS_PEEPS][localName] = clientData;
    fullMap[peepRootKey] = clientData;
    addToDeps.push(clientData);

    return localName;
  },

  //////////////////////////////////////////////////////////////////////////////
  // Peep Mutation
  //
  // "My peeps"; people I have an explicit relationship with and who are allowed
  //  to send me messages

  /**
   * Add a contact to our address book.
   *
   * @designCall[clarkbw]{
   *   Adding a contact acts like the user you sent you a message at that
   *   instant.  We may eventually add fake messages 'like "Andrew and you
   *   are connected.  Here's everything you know about him now..."'.
   * }
   */
  _cmd_addContact: function(peepRootKey, signedOident) {
    var now = Date.now();

    var arg = {
      store: this, peepOident: signedOident, othPubring: this._pubring,
    };
    return $Q.wait(
      (new $ls_tasks.PeepNameTrackTask(arg, this._log)).run(),
      this._db.updateIndexValue($lss.TBL_PEEP_DATA,
                                $lss.IDX_PEEP_ANY_INVOLVEMENT,
                                '',
                                peepRootKey, now),
      this._db.updateIndexValue($lss.TBL_PEEP_DATA,
                                $lss.IDX_PEEP_WRITE_INVOLVEMENT,
                                '',
                                peepRootKey, now));
  },

  /**
   * Set some meta-data about a contact in our address book (pinned, etc.)
   */
  _cmd_metaContact: function(peepRootKey, meta) {
    this._db.putCells($lss.TBL_PEEP_DATA, peepRootKey, {
      'd:meta': meta,
    });
    // -- persist
    // -- notify affected queries
    // -- notify subscribed blurbs
  },

  /**
   * Set some contact-provided meta-data about a contact in our address book.
   */
  /*
  _cmd_setContactPeepMeta: function() {
  },
  */

  /*
  _cmd_delContact: function() {
  },
  */

  /**
   * Save our self other-ident into the database so our 'peep' data about
   *  ourselves makes us look like a contact.  This is so simplify the lives
   *  of logic that can get away without needing to be explicitly aware of the
   *  concept of 'me'.
   */
  saveOurOwnSelfIdents: function(selfIdentBlob, selfOtherIdentBlob) {
    this._db.putCells($lss.TBL_PEEP_DATA, this._keyring.rootPublicKey, {
      'd:oident': selfOtherIdentBlob,
      'd:sident': selfIdentBlob,
    });
  },

  //////////////////////////////////////////////////////////////////////////////
};

var LOGFAB = exports.LOGFAB = $log.register($module, {
  localStore: {
    //implClass: AuthClientConn,
    type: $log.DAEMON,
    subtype: $log.DAEMON,
    events: {
      contactRequest: {requester: 'key'},

      newConversation: {convId: true},
      conversationMessage: {convId: true, nonce: true},
    },
    TEST_ONLY_events: {
    },
    calls: {
      replicaCmd: {command: true},
    },
    TEST_ONLY_calls: {
      replicaCmd: {id: true},
    },
  },
});
}); // end define
