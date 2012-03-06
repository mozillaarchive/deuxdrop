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
'use strict';
var when = $Q.when;

var PINNED = 'pinned';

var NS_PEEPS = 'peeps',
    NS_CONVBLURBS = 'convblurbs',
    NS_CONVMSGS = 'convmsgs',
    NS_CONVNEW = 'convnew',
    NS_SERVERS = 'servers',
    NS_POSSFRIENDS = 'possfriends',
    NS_CONNREQS = 'connreqs',
    NS_ERRORS = 'errors';

var setIndexValue = $notifking.setIndexValue,
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
   * Used by `_fillOutQueryDepsAndSend` to track any pending dependent database
   *  lookups which all other query send requests need to block on in order
   *  to ensure coherency in what we send over the moda bridges.
   */
  this._queryFillPromise = false;



  /**
   * @dictof[
   *   @key["conversation id"]
   *   @value[@dict[
   *     @key[firstNewMessage Number]{
   *       The one-based name of the first new message.
   *     }
   *     @key[lastNewMessage Number]{
   *       The one-based name of the last new message; this is used to
   *       determine when a conversation is completely caught up without having
   *       to source the data from elsewhere.  This is mainly useful for
   *       newness nuking replica blocks, as in the case of processing a meta
   *       message we will have the data in memory already.
   *     }
   *     @key[mostRecentActivity DateMS]{
   *       The timestamp of the most recent activity.
   *     }
   *   ]]
   * ]{
   *   In-memory representation for tracking new conversations/messages.
   * }
   */
  this._newConversations = null;
  /**
   * Stores references to a subset of the data from `_newConversations` that
   *  needs to be written to disk.  Flushed on update phase completion.  Exists
   *  to reduce write turnover.  Nulls indicate cells to be deleted.
   */
  this._newConversationsDirty = null;
  /**
   * Stores flags indicating whether anything has been written to the disk
   *  for the given value so we know whether we have to issue a delete.
   */
  this._newConversationsWritten = null;

  /**
   * If a function is currently `runMutexed`, the deferred to be resolved once
   *  it completes.
   */
  this._mutexDeferred = false;
  /**
   * @listof[@dict[
   *   @key[func Function]{
   *     The function to run inside the mutex.
   *   }
   *   @key[deferred Deferred]{
   *     The deferred that owns the promise we returned when the call to
   *     `runMutexed` was made and we could not immediately service it.
   *   }
   * ]]{
   *   The list of functions yet to run that want to run mutexed.
   * }
   */
  this._mutexQueue = [];

  this._mutexRunSuccess = this._mutexRunCompleted.bind(this, true);
  this._mutexRunFailure = this._mutexRunCompleted.bind(this, false);

  // initialize the db schema and kickoff the bootstrap once the db is happy
  this.ready = false;
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
    // populate our fake self-peep data that `saveOurOwnSelfIdents` doesn't
    //  address
    if (isFirstRun) {
      this._db.putCells($lss.TBL_PEEP_DATA, this._keyring.rootPublicKey, {
        'd:meta': {},
        'd:nunread': 0,
        'd:nconvs': 0,
      });
    }

    // - load our list of pinned peeps by root key
    // XXX actually load after we actually support pinned peeps

    // - newness tracking
    this._loadNewConversationActivity();
  },

  //////////////////////////////////////////////////////////////////////////////
  // Exclusive Database Access

  /**
   * Invoke a function when no other calls gated by this function are running.
   *  If the function returns a promise, we do not run the next mutexed function
   *  until the promise is resolved/rejected.
   *
   * This function is intended to serialize all visible-state-mutating functions
   *  and any state-exposing functions that could be impacted by the operation
   *  of a mutating function.  In other words, writes are serialized but reads
   *  don't have to be if their view of data will always be sufficiently
   *  coherent no matter what the writes get up to.
   *
   * It's probably safest to err on the side of serializing most things.  For
   *  example, our index scans will return a coherent list of items from a
   *  single point in time and the data rows are usually atomic and consistent.
   *  However, in the event that a mutation occurs on an index while we are
   *  still loading the data for the index, the net result is going to be
   *  unreliable.  We could defer processing modifications against queries
   *  in their initial phase, but then we need to make sure the processing
   *  happens later (which is ugly/complex).  We could ignore modifications
   *  against queries in their initial phase, but then we are entirely weakening
   *  our guarantees.
   *
   * Additionally, if any I/O is required, in most cases it's probably better
   *  to avoid inter-mingling I/O of two separate tasks.
   */
  runMutexed: function(thingToRun) {
    if (this._mutexDeferred) {
      var deferred = $Q.defer();
      this._mutexQueue.push({ func: thingToRun, deferred: deferred });
      return deferred.promise;
    }

    var result = thingToRun();
    this._mutexActive = true;
    if (!$Q.isPromise(result)) {
      this._mutexActive = false;
      return result;
    }

    this._mutexDeferred = $Q.defer();
    when(result, this._mutexRunSuccess, this._mutexRunFailure);
    return this._mutexDeferred.promise;
  },

  _mutexRunCompleted: function(success, result) {
    if (success) {
      this._mutexDeferred.resolve(result);
    }
    else {
      this._mutexDeferred.reject(result);
    }

    if (this._mutexQueue.length === 0) {
      this._mutexDeferred = null;
      return;
    }

    var toRun = this._mutexQueue.shift();
    this._mutexDeferred = toRun.deferred;
    // (not bothering with fast-pathing here)
    when(toRun.func(), this._mutexRunSuccess, this._mutexRunFailure);
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
    var self = this;
    return this.runMutexed(function() {
      // (we used to JSON.stringify, now we don't)
      var mform = serialized,
          authed, block;
      if (mform.hasOwnProperty("fanmsg")) {
        return self._proc_fanmsg(mform);
      }
      // explicitly typed, currently implies contact request
      else if(mform.hasOwnProperty("type")) {
        return self._proc_reqmsg(mform);
      }
      else {
        if (mform.hasOwnProperty("nonce")) {
          block = JSON.parse(self._keyring.openSecretBoxUtf8With(
                      mform.sboxed, mform.nonce, 'replicaSbox'));
        }
        else {
          self._keyring.verifyAuthUtf8With(mform.auth, mform.block,
                                           'replicaAuth');
          block = JSON.parse(mform.block);
        }
        return self._performReplicaCommand(block.cmd, block.id, block.data);
      }
    });
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

  /**
   * Generate a replica block and immediately return it, while asynchronously
   *  triggering the processing of the crypto block.  No notification is
   *  provided when the crypto block is fully processed, so beware.
   *
   * An encrypted replica block is generated which the mailstore cannot read.
   *  However, do keep in mind that there may be a lot of explicit context to
   *  the means by which we provide the replica block to the mailstore.
   *  Additionally, there may be some context that is inferrable from recent
   *  activity between the server and us which is explicit.
   */
  generateAndPerformReplicaCryptoBlock: function(command, id, payload) {
    var serialized = this.generateReplicaCryptoBlock(command, id, payload),
        self = this;
    this.runMutexed(function() {
      when(self._performReplicaCommand(command, id, payload),
           function() {
             // we want to make sure any database effects of the above are relayed
             self._notif.updatePhaseDoneReleaseNotifications();
           });
    });
    return serialized;
  },

  /**
   * Generate a replica block and immediately return it, while asynchronously
   *  triggering the processing of the crypto block.  No notification is
   *  provided when the crypto block is fully processed, so beware.
   *
   * A (shared-secret) authenticated replica block that can be authenticated by
   *  other clients is generated whose contents are exposed.  This should be
   *  used when the mailstore needs to be able to see the contents but we still
   *  want other clients to be able to tell things the mailstore made apart
   *  from things a valid client said.
   */
  generateAndPerformReplicaAuthBlock: function(command, id, payload) {
    var serialized = this.generateReplicaAuthBlock(command, id, payload),
        self = this;
    this.runMutexed(function() {
      when(self._performReplicaCommand(command, id, payload),
           function() {
             // we want to make sure any database effects of the above are relayed
             self._notif.updatePhaseDoneReleaseNotifications();
           });
    });
    return serialized;
  },

  /**
   * Notification from the client that the server has conveyed that we are
   *  caught up, and, accordingly, we can release any notifications we were
   *  batching up.
   */
  replicaCaughtUp: function() {
    return this._notif.updatePhaseDoneReleaseNotifications();
  },

  //////////////////////////////////////////////////////////////////////////////
  // Notifications

  /**
   * If there are any required dataDeps for the queryHandle, then retrieve them
   *  and re-run, otherwise send the query results.
   */
  _fillOutQueryDepsAndSend: function(queryHandle, querySource) {
    var self = this;
    if (!querySource)
      querySource = queryHandle.owner;

    // If we are currently waiting on dependencies to be loaded (because
    //  of a separate, parallel call to _fillOutQueryDepsAndSend), then wait
    //  on that before resolving us.
    if (this._queryFillPromise)
      return (when(
        this._queryFillPromise,
          function() {
            return self._fillOutQueryDepsAndSend(queryHandle, querySource);
          }));

    // fetch blurbs before peeps because blurbs can generate peep deps
    if (querySource.dataNeeded[NS_CONVBLURBS].length) {
      var convIds = querySource.dataNeeded[NS_CONVBLURBS].splice(0,
                      querySource.dataNeeded[NS_CONVBLURBS].length);
      this._queryFillPromise = when(
        this._lookupMultipleItemsById(
          querySource, null, this._fetchConversationBlurb, NS_CONVBLURBS,
          null, null, convIds),
        function() {
          self._queryFillPromise = null;
          return self._fillOutQueryDepsAndSend(queryHandle, querySource);
        });
      return this._queryFillPromise;
    }
    // fetch peep deps last-ish because they can't generate deps
    if (querySource.dataNeeded[NS_PEEPS].length) {
      var peepRootKeys = querySource.dataNeeded[NS_PEEPS].splice(0,
                           querySource.dataNeeded[NS_PEEPS].length);
      // we never pass index/indexparam because a query on peeps would always
      //  get its data directly, not by our dependency loading logic.
      this._queryFillPromise = when(
        this._lookupMultipleItemsById(
          querySource, null, this._fetchPeepBlurb, NS_PEEPS,
          null, null, peepRootKeys),
        function() {
          self._queryFillPromise = null;
          return self._fillOutQueryDepsAndSend(queryHandle, querySource);
        });
      return this._queryFillPromise;
    }
    return this._notif.sendQueryResults(queryHandle, querySource);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Common lookup logic

  /**
   * Perform an index scan, use the results to perform lookups on items not
   *  already loaded, then send the query results when done.  This is run
   *  mutexed to avoid potential inconsistency relating to the ordering of the
   *  index or the index values associated with an item.
   */
  _indexScanLookupAndReport: function(writeQueryHandle, namespace, fetchFunc,
                                      table, index, indexParam, scanDir,
                                      scanFunc) {
    // XXX fix up gendb redis impl to not need separate string signature
    if (!scanFunc)
      scanFunc = 'scanIndex';

    var self = this;
    return this.runMutexed(function() {
      return when(
        self._db[scanFunc](table, index, indexParam, scanDir,
                           null, null, null, null, null, null),
        function(ids) {
          return when(
            self._lookupMultipleItemsById(
              writeQueryHandle.owner, writeQueryHandle,
              fetchFunc, namespace,
              index, indexParam, ids),
            function() {
              self._fillOutQueryDepsAndSend(writeQueryHandle);
            });
        });
    });
  },

  _lookupMultipleItemsById: function(querySource, writeQueryHandle,
                                     fetchFunc, namespace,
                                     usingIndex, indexParam, ids) {
    var i = 0, stride = 1, self = this,
        viewItems = [], clientDataItems = null;
    if (usingIndex) {
      writeQueryHandle.items = clientDataItems = [];
      writeQueryHandle.splices.push({index: 0, howMany: 0, items: viewItems});
      stride = 2;
    }
    function getNextMaybeGot() {
      while (i < ids.length) {
        var convId = ids[i], clientData;
        // - attempt cache re-use (if valid)
        if ((clientData = self._notif.reuseIfAlreadyKnown(querySource,
                                                          namespace,
                                                          convId))) {
          // It's possible this was a speculative naming entry (data == null),
          //  ignore if so.
          if (clientData.data) {
            // insert the appropriate index entry in the rep if using one
            if (usingIndex) {
              setIndexValue(clientData.indexValues, usingIndex, indexParam,
                            ids[i + 1]);
            }
            viewItems.push(clientData.localName);
            if (clientDataItems)
              clientDataItems.push(clientData);
            i += stride;
            continue;
          }
        }

        return when(fetchFunc.call(self, querySource, ids[i], clientData),
                    function(clientData) {
          if (usingIndex) {
            setIndexValue(clientData.indexValues, usingIndex, indexParam,
                          ids[i + 1]);
          }
          viewItems.push(clientData.localName);
          if (clientDataItems)
            clientDataItems.push(clientData);
          i += stride;
          return getNextMaybeGot();
        });
      }

      return null;
    }

    return getNextMaybeGot();
  },

  //////////////////////////////////////////////////////////////////////////////
  // Conversation Lookup

  /**
   * Retrieve a converation blurb from the datastore for inclusion in the
   *  provided query.  Only invoked after failing to retrieve the data from
   *  cache, and so always generates a new data structure.  The structure is
   *  immediately named and contributed to the members map prior to yielding
   *  control flow so that no duplicate loading occurs.
   */
  _fetchConversationBlurb: function(querySource, convId) {
    var self = this;
    var clientData = this._notif.generateClientData(querySource, NS_CONVBLURBS,
                                                    convId);

    return when(this._db.getRow($lss.TBL_CONV_DATA, convId, null),
                function(cells) {

      // -- build the client rep
      querySource.dataMap[NS_CONVBLURBS][clientData.localName] =
        self._convertConversationBlurb(clientData, querySource, cells);
      return clientData;
    });
  },

  /**
   * Create a send-to-moda-bridge wire representation representation of a
   *  conversation blurb given its cells.
   */
  _convertConversationBlurb: function(clientData, querySource, cells) {
    var numMessages = cells['d:m'], convId = clientData.fullName;
    var participants = [];

    clientData.data = {
      // The crypto keys/transit server info for this conversation.  Needed so
      //  we can send messages to the conversation without a db lookup.
      meta: cells['d:meta'],
      // Our user's publicly exposed meta about this conversation.  Needed so
      //  we can compute state deltas without a db lookup.
      pubMeta: cells['d:u' + this._keyring.rootPublicKey] || {},
      // Our user's private meta about this conversation.  Likewise required for
      //  delta computation.
      privMeta: cells['d:ourmeta'] || {},
      // The index of the first human messages, used to suppress subsequent
      //  notifications once we have seen the first. (1-based!)
      first: null,
      // The index of the first unread human message, used to suppress
      //  subsequent notifications. (1-based!)
      unread: null,
    };

    var highReadMsg = clientData.data.pubMeta.lastRead || 0;

    // -- process messages
    // - first message, participants list
    var msg, iMsg, firstMsgName = null, iFirstMsg = null, msgClientData,
        mostRecentActivity;
    for (iMsg = 1; iMsg <= numMessages; iMsg++) {
      msg = cells['d:m' + iMsg];
      if (!iFirstMsg && msg.type === 'message') {
        msgClientData = this._convertConversationMessage(
                          querySource, convId, iMsg, cells);
        clientData.deps.push(msgClientData);
        firstMsgName = msgClientData.localName;
        iFirstMsg = clientData.data.first = iMsg;
      }
      else if (msg.type === 'join') {
        participants.push(this._deferringPeepQueryResolve(querySource,
                                                          msg.id,
                                                          clientData.deps));
      }
      mostRecentActivity = msg.receivedAt;
    }
    if (!iFirstMsg)
      iFirstMsg = 1;

    // - number of unread
    var firstUnreadMsgName = null;
    for (iMsg = highReadMsg + 1; iMsg <= numMessages; iMsg++) {
      msg = cells['d:m' + iMsg];
      if (msg.type === 'message') {
        // (we used to count the number of unread human messages; currently
        //  bailing on that so we can show join activity as something unread.)
        // - first unread (non-join) message...
        if (!firstUnreadMsgName) {
          clientData.data.unread = iMsg;
          msgClientData = this._convertConversationMessage(
                            querySource, convId, iMsg, cells);
          clientData.deps.push(msgClientData);
          firstUnreadMsgName = msgClientData.localName;
        }
      }
    }

    return {
      participants: participants,
      firstMessage: firstMsgName,
      firstUnreadMessage: firstUnreadMsgName,
      pinned: clientData.data.privMeta.pinned || false,
      numUnread: numMessages - highReadMsg,
      mostRecentActivity: mostRecentActivity,
    };
  },

  /**
   * Create a send-to-moda-bridge wire delta representation for changes to a
   *  converstaion blurb given the changed hbase cells.
   */
  _convertConversationBlurbDelta: function(querySource, clientData, outDeltaRep,
                                           cells, mutatedCells) {
    for (var key in mutatedCells) {
      // - participants
      if (/^d:p/.test(key)) {
        if (!outDeltaRep.hasOwnProperty("participants"))
          outDeltaRep.participants = [];
        outDeltaRep.participants.push(
          this._deferringPeepQueryResolve(querySource, mutatedCells[key],
                                          clientData.deps));
      }
    }
    // - If this is our first/first unread human message, populate.
    var msgNum = mutatedCells['d:m'], msgRec = mutatedCells['d:m' + msgNum];
    if (msgRec.type === 'message' &&
        (!clientData.data.first || !clientData.data.unread)) {
      var mergedCells = $notifking.mergeCells(cells, mutatedCells);
      var msgClientData = this._convertConversationMessage(
                            querySource, clientData.fullName, msgNum,
                            mergedCells);
      clientData.deps.push(msgClientData);

      if (!clientData.data.first) {
        // (use the recount provided by the conversion and dep-ing above)
        outDeltaRep.firstMessage = msgClientData.localName;
        clientData.data.first = msgNum;

        // send this as the first unread too if we ain't got one yet
        if (!clientData.data.unread) {
          // track the dependency separately, we don't own the above refcount
          msgClientData.count++;
          clientData.deps.push(msgClientData);

          outDeltaRep.firstUnreadMessage = outDeltaRep.firstMessage;
          clientData.data.unread = msgNum;
        }
      }
      else { // !clientData.data.unread
        // (we have ownership of the refcount provided by the conversion)
        outDeltaRep.firstUnreadMessage = msgClientData.localName;
        clientData.data.unread = msgNum;
      }
    }
    // - mostRecentActivity
    outDeltaRep.mostRecentActivity = msgRec.receivedAt;

    // - numUnread
    var highReadMsg = clientData.data.pubMeta.lastRead || 0,
        numMessages = mutatedCells['d:m'];
    outDeltaRep.numUnread = numMessages - highReadMsg;

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
      function buildReps(clientData, querySource) {
        if (!mergedCells) // merge only the first time needed
          mergedCells = $notifking.mergeCells(cells, mutatedCells);
        return self._convertConversationBlurb(
          clientData, querySource, mergedCells
        );
      });
  },

  /**
   * Notification about a modified conversation; triggered because of a single
   *  processed message (join/human message/metadata) or other metadata change
   *  by our user.  Emphasis on the ONE added message.
   */
  _notifyModifiedConversation: function(convId, cells, mutatedCells,
                                        updatedIndexValues) {
    var self = this;

    // -- messages
    // Do this before blurbs because the added notification assumes this is the
    //  first the system has heard of the object and we can produce duplicates
    //  if the order is the other way.
    if (mutatedCells.hasOwnProperty('d:m')) {
      var msgNum = mutatedCells['d:m'],
          msgRec = mutatedCells['d:m' + msgNum],
          msgFullName = convId + msgNum;
      this._notif.namespaceItemAdded(
        NS_CONVMSGS, msgFullName, cells, mutatedCells,
        // we use a synthetic index which is the message number
        [
          ['order', null, null, msgNum],
        ],
        function(clientData, querySource) {
          return self._convertConversationMessage(
                   querySource, convId, msgNum,
                   $notifking.mergeCells(cells, mutatedCells),
                   clientData);
        });
    }

    // -- blurb
    var mergedCells = null;
    // we don't provide an indexPopulater because current filtering only occurs
    //  on peeps, and a newly added peep is going to already have all of their
    //  relevant index values in updatedIndexValues
    this._notif.namespaceItemModified(
      NS_CONVBLURBS, convId, cells, mutatedCells, updatedIndexValues,
      function genFullReps(clientData, querySource) {
        if (!mergedCells) // merge only the first time needed
          mergedCells = $notifking.mergeCells(cells, mutatedCells);
        return self._convertConversationBlurb(
          clientData, querySource, mergedCells
        );
      },
      function genDeltaReps(clientData, querySource, outDeltaRep) {
        // no change to the backside rep is required beause we don't need the
        //  set of participants under our current shared-key-per-conversation
        //  crypto key setup.  If the crypto changes, this may change.
        return self._convertConversationBlurbDelta(
          querySource, clientData, outDeltaRep, cells, mutatedCells);
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
                            queryHandle.owner, NS_CONVBLURBS, convId);
    if (!blurbClientData) {
      throw this._notifking.badQuery(queryHandle, "Conv blurb does not exist!");
    }
    queryHandle.deps.push(blurbClientData);

    queryHandle.index = 'order';
    queryHandle.cmpFunc = function(aClientData, bClientData) {
      return aClientData.data.index - bClientData.data.index;
    };
    queryHandle.testFunc = function(baseCells, mutatedCells, msgFullName) {
      return (msgFullName.substring(0, convId.length) === convId);
    };

    // - does the bridge already know the answer to the question?
    // XXX semantics change means in order to perform full reuse we need to
    //  have some concept of being confident we already have all of the
    //  messages in question loaded.  This means being able to see we already
    //  have the exact query already populated, so for now...
    // XXX punt on this optimization and just re-query the database (but
    //  we will normalize for each message.)
    /*
    var msgsClientData = this._notif.reuseIfAlreadyKnown(
                           queryHandle.owner, NS_CONVMSGS, convId);
    if (msgsClientData) {
      this._fillOutQueryDepsAndSend(queryHandle);
      return;
    }
    */

    // - need to fetch the data
    this._fetchConversationMessages(queryHandle, convId);
  },

  /**
   * Produce a message record clientData struct from its database storage
   *  (cell) format.  Also supports a mode of operation where it updates an
   *  existing clientData structure, in which case the return value is the
   *  frontData (which does not get directly set either.)
   *
   * If no clientData is provided (and so one is created), the caller is
   *  responsible for adding it to the appropriate deps list.
   */
  _convertConversationMessage: function(querySource, convId, msgIndex, cells,
                                        clientData) {
    var msg = cells['d:m' + msgIndex];
    var fullName = convId + msgIndex, reuseMode;
    if (!clientData) {
      reuseMode = false;
      clientData = this._notif.reuseIfAlreadyKnown(querySource, NS_CONVMSGS,
                                                   fullName);
      if (clientData)
        return clientData;

      clientData = this._notif.generateClientData(querySource, NS_CONVMSGS,
                                                  fullName);
    }
    else {
      reuseMode = true;
    }

    clientData.data = {
      convId: convId,
      index: msgIndex,
    };

    var frontData;
    if (msg.type === 'message') {
      frontData = {
        type: 'message',
        author: this._deferringPeepQueryResolve(querySource, msg.authorId,
                                                clientData.deps),
        composedAt: msg.composedAt,
        receivedAt: msg.receivedAt,
        text: msg.text,
        mark: null,
      };
    }
    else if (msg.type === 'join') {
      frontData = {
        type: 'join',
        inviter: this._deferringPeepQueryResolve(querySource, msg.by,
                                                 clientData.deps),
        invitee: this._deferringPeepQueryResolve(querySource, msg.id,
                                                 clientData.deps),
        receivedAt: msg.receivedAt,
        text: msg.text,
        mark: null,
      };
    }
    else {
      throw new Error("Unknown message type '" + msg.type + "'");
    }

    // -- look for metadata annotations
    for (var key in cells) {
      if (/^d:u/.test(key)) {
        var userRootKey = key.substring(3);
        var userMeta = cells[key];
        // - user's read watermark
        if (userMeta.lastRead && userMeta.lastRead === msgIndex &&
            userRootKey !== this._pubring.rootPublicKey) {
          if (!frontData.mark)
            frontData.mark = [];
          frontData.mark.push(this._deferringPeepQueryResolve(
                                querySource, userRootKey, clientData.deps));
        }
      }
    }

    if (reuseMode)
      return frontData;

    querySource.dataMap[NS_CONVMSGS][clientData.localName] = frontData;
    return clientData;
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
    var viewItems = [];
    queryHandle.splices.push({ index: 0, howMany: 0, items: viewItems });

    var self = this;
    return when(this._db.getRow($lss.TBL_CONV_DATA, convId, null),
                function(cells) {
      // -- build the client rep
      var numMessages = cells['d:m'];

      // - all messages
      for (var iMsg = 1; iMsg <= numMessages; iMsg++) {
        var clientData = self._convertConversationMessage(
                           querySource, convId, iMsg, cells);
        queryHandle.items.push(clientData);
        viewItems.push(clientData.localName);
      }

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
    return this._indexScanLookupAndReport(
             queryHandle, NS_CONVBLURBS, this._fetchConversationBlurb,
             $lss.TBL_CONV_DATA, index, peepRootKey, -1);
  },

  /**
   * Get the list of all known conversations.
   *
   * @args[
   *   @param[query @dict[
   *   ]]
   * ]
   */
  queryAndWatchAllConversationBlurbs: function(queryHandle) {
    // pick the index to use
    var index = queryHandle.index = $lss.IDX_ALL_CONVS,
        indexParam = queryHandle.indexParam = '';

    // comparison predicate is keyed off the index
    queryHandle.cmpFunc = function(aClientData, bClientData) {
      var aVal = assertGetIndexValue(aClientData.indexValues,
                                     index, indexParam),
          bVal = assertGetIndexValue(aClientData.indexValues,
                                     index, indexParam);
      return aVal - bVal;
    };

    queryHandle.testFunc = function(baseCells, mutatedCells, convId) {
      // all conversations match
      return true;
    };

    return this._indexScanLookupAndReport(
             queryHandle, NS_CONVBLURBS, this._fetchConversationBlurb,
             $lss.TBL_CONV_DATA, index, '', -1);
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
      var rootKey = recipRootKeys[iRecip],
          recipIsOurUser = (rootKey === this._keyring.rootPublicKey);

      // - boost any involvement
      if (!recipIsOurUser)
        peepMaxes.push([$lss.IDX_PEEP_ANY_INVOLVEMENT, '', rootKey, timestamp]);
      // (authorRootKey previously got an any involvement above)
      if (authorRootKey !== rootKey)
        convUpdates.push([$lss.IDX_CONV_PEEP_ANY_INVOLVEMENT, rootKey,
                          convId, timestamp]);
      // - boost recip involvement
      if (authorIsOurUser) {
        if (!recipIsOurUser)
          peepMaxes.push([$lss.IDX_PEEP_RECIP_INVOLVEMENT, '',
                          rootKey, timestamp]);

        convUpdates.push([$lss.IDX_CONV_PEEP_RECIP_INVOLVEMENT, rootKey,
                      convId, timestamp]);
      }
    }
  },

  //////////////////////////////////////////////////////////////////////////////
  // New Conversation Activity
  //
  // A conversation/messages are eligible for being treated as "new" if they are
  //  being processed as a result of a 'live' replica block feed (rather than a
  //  backfill / on-demand retrieval).  They are determined non-new if
  //  metadata marks them as already read or a replica block explicitly clears
  //  the new status.

  /**
   * Query conversations with new activity.  We require that this call only
   *  be issued after the database has successfully bootstrapped itself, meaning
   *  that `_loadNewConversationActivity` has been run and its returned promise
   *  has been resolved.
   *
   * This operation must not operate concurrently with processing that could
   *  alter the newness state of messages, and so it does not.  We use
   *  `runMutexed` to ensure this.
   *
   * Ordering is based on most recent activity in the conversation, although it
   *  is expected that UIs will maintain a stable ordering while the results
   *  are being looked at.
   */
  queryAndWatchNewConversationActivity: function(queryHandle) {
    // -- query setup
    var index = queryHandle.index = 'recency',
        indexParam = queryHandle.indexParam = null, self = this;

    // comparison predicate is keyed off the index
    queryHandle.cmpFunc = function(aClientData, bClientData) {
      var aVal = assertGetIndexValue(aClientData.indexValues,
                                     index, indexParam),
          bVal = assertGetIndexValue(aClientData.indexValues,
                                     index, indexParam);
      return aVal - bVal;
    };

    queryHandle.testFunc = function(baseCells, mutatedCells, convId) {
      // All conversations *in this namespace* match.  Conversations only get in
      //  this namespace if they have new messages.
      return true;
    };

    // -- trigger
    return this.runMutexed(function() {
      // -- compute new convs sorted by recency (descending)
      var newConvsArray = [];
      // put them in an array
      for (var key in self._newConversations) {
        newConvsArray.push([key, self._newConversations[key]]);
      }
      // sort them
      newConvsArray.sort(function(a, b) {
        return b[1].mostRecentActivity - a[1].mostRecentActivity;
      });
      // convert to (flattened) pairs of [convId, mostRecentActivity]
      var convIdsAndRecency = [];
      for (var i = 0; i < newConvsArray.length; i++) {
        var newConvPair = newConvsArray[i];
        convIdsAndRecency.push(newConvPair[0]);
        convIdsAndRecency.push(newConvPair[1].mostRecentActivity);
      }

      return when(
        self._lookupMultipleItemsById(
          queryHandle.owner, queryHandle,
          self._fetchPopulateConversationActivity, NS_CONVNEW,
          'recency', null, convIdsAndRecency),
        function() {
          self._fillOutQueryDepsAndSend(queryHandle);
        });
    });
  },

  /**
   * The basic idea is to fetch the row for each conversation so we can
   *  populate the list of new messages.  For simplicity, we assume that the
   *  messages are not currently exposed to the moda bridge and so we need to
   *  do the db read.  Correctness is handled under the hood by the message
   *  conversion logic which knows to reuse an existing rep if one exists.
   */
  _fetchPopulateConversationActivity: function(querySource, convId) {
    var self = this,
        clientData = this._notif.generateClientData(querySource, NS_CONVNEW,
                                                    convId);

    return when(this._db.getRow($lss.TBL_CONV_DATA, convId, null),
                function(cells) {
      // - blurb
      var blurbClientData = self._notif.reuseIfAlreadyKnown(
                              querySource, NS_CONVBLURBS, convId);
      if (!blurbClientData) {
        blurbClientData = self._notif.generateClientData(
                            querySource, NS_CONVBLURBS, convId);
        querySource.dataMap[NS_CONVBLURBS][blurbClientData.localName] =
          self._convertConversationBlurb(blurbClientData, querySource,
                                         cells);
      }
      clientData.deps.push(blurbClientData);

      // - (new) messages
      var newRec = self._newConversations[convId],
          dataRep = querySource.dataMap[NS_CONVNEW][clientData.localName] = {
            conv: blurbClientData.localName,
            messages: [],
          };

      for (var iNew = newRec.firstNewMessage;
           iNew <= newRec.lastNewMessage; iNew++) {
        var msgClientData = self._convertConversationMessage(
                              querySource, convId, iNew, cells);
        clientData.deps.push(msgClientData);
        dataRep.messages.push(msgClientData.localName);
      }

      return clientData;
    });
  },

  /**
   * Load our newness state from the database into our in-memory structure.
   *  Our database and in-memory representations are identical.
   */
  _loadNewConversationActivity: function() {
    var self = this;
    return when(this._db.getRow($lss.TBL_NEW_TRACKING,
                                $lss.ROW_NEW_CONVERSATIONS, null),
      function(cells) {
        var newReps = self._newConversations = {};
        var written = self._newConversationsWritten = {};
        for (var key in cells) {
          var convId = key.substring(2);
          newReps[convId] = cells[key];
          written[convId] = true;
        }
      });
  },

  /**
   * Issue database writes/deletions for the new conversation activity as
   *  needed.
   */
  _writeDirtyNewConversationActivity: function() {
    if (!this._newConversationsDirty)
      return;

    var toWrite = this._newConversationsDirty, writeCells = {},
        written = this._newConversationsWritten, anyWrites = false;
    for (var convId in toWrite) {
      var val = toWrite[convId];
      if (val == null) {
        delete written[convId];
        this._db.deleteRowCell($lss.TBL_NEW_TRACKING,
                               $lss.ROW_NEW_CONVERSATIONS,
                               'd:' + convId);
      }
      else {
        // nb: we are relying on the database implementation to snapshot the
        //  value by the time we return; if the snapshotting gets delayed,
        //  correctness could be compromised because `val` is shared and can
        //  change.
        writeCells['d:' + convId] = val;
        anyWrites = true;
        written[convId] = true;
      }
    }

    if (anyWrites) {
      this._db.putCells($lss.TBL_NEW_TRACKING, $lss.ROW_NEW_CONVERSATIONS,
                        writeCells);
    }

    this._newConversationsDirty = null;
  },

  /**
   * Invoked as new-eligible messages are added to the system.
   */
  _trackNewishMessage: function(convId, msgNum, msgRec, baseCells,
                                mutatedCells) {
    var newRec, self = this, mergedCells = mutatedCells ? null : baseCells;

    // - new message in an already new-tracked conversation
    if (this._newConversations.hasOwnProperty(convId)) {
      newRec = this._newConversations[convId];
      newRec.mostRecentActivity = msgRec.receivedAt;
      newRec.lastNewMessage = msgNum;

      this._notif.namespaceItemModified(
        NS_CONVNEW, convId, null, null,
        [['recency', null, null, newRec.mostRecentActivity]],
        null,
        function newConvDeltaAdd(clientData, querySource, outDeltaRep) {
          if (!mergedCells)
            mergedCells = $notifking.mergeCells(baseCells, mutatedCells);
          var msgClientData = self._convertConversationMessage(
                                querySource, convId, msgNum, mergedCells);
          clientData.deps.push(msgClientData);

          if (!outDeltaRep.hasOwnProperty("add"))
            outDeltaRep.add = [];
          outDeltaRep.add.push(msgClientData.localName);
        });
    }
    // - first new-tracked message for this conversation
    else {
      newRec = this._newConversations[convId] = {
        firstNewMessage: msgNum,
        lastNewMessage: msgNum,
        mostRecentActivity: msgRec.receivedAt,
      };
      this._notif.namespaceItemAdded(
        NS_CONVNEW, convId, null, null,
        [['recency', null, null, newRec.mostRecentActivity]],
        function newConvPopulate(clientData, querySource, convId) {
          if (!mergedCells)
            mergedCells = $notifking.mergeCells(baseCells, mutatedCells);

          // - we need the blurb
          var blurbClientData = self._notif.reuseIfAlreadyKnown(
                                  querySource, NS_CONVBLURBS, convId);
          if (!blurbClientData) {
            blurbClientData = self._notif.generateClientData(
                                querySource, NS_CONVBLURBS, convId);
            querySource.dataMap[NS_CONVBLURBS][blurbClientData.localName] =
              self._convertConversationBlurb(blurbClientData, querySource,
                                             mergedCells);
          }
          clientData.deps.push(blurbClientData);

          // - we need the message
          var msgClientData = self._convertConversationMessage(
                                querySource, convId, msgNum, mergedCells);
          clientData.deps.push(msgClientData);
          return {
            conv: blurbClientData.localName,
            messages: [msgClientData.localName],
          };
        });
    }
    if (!this._newConversationsDirty)
      this._newConversationsDirty = {};
    this._newConversationsDirty[convId] = newRec;
  },

  /**
   * Invoked as watermarks are received for our user or if explicit replica
   *  blocks are received.
   */
  _mootNewForMessages: function(convId, lastReadMessage) {
    if (!this._newConversations.hasOwnProperty(convId))
      return;

    var newRec = this._newConversations[convId];
    // - no effect (if the mootness does not touch the newness at all)
    if (lastReadMessage < newRec.firstNewMessage)
      return;

    if (!this._newConversationsDirty)
      this._newConversationsDirty = {};
    // - partial update, still something new present
    if (lastReadMessage < newRec.lastNewMessage) {
      var self = this;
      // recency is not affected so we don't touch the indices
      this._notif.namespaceItemModified(
        NS_CONVNEW, convId, null, null, null,
        null,
        function newConvDeltaMoot(clientData, querySource, outDeltaRep) {
          if (!outDeltaRep.hasOwnProperty("moot"))
            outDeltaRep.moot = 0;
          // tell it how many to splice out
          var mootDex = newRec.firstNewMessage;
          outDeltaRep.moot += lastReadMessage - mootDex + 1;
          // forget the messages as dependencies
          while (mootDex <= lastReadMessage) {
            self._notif.findAndForgetDep(querySource, clientData, NS_CONVMSGS,
                                         convId + (mootDex++));
          }
        });
      newRec.firstNewMessage = lastReadMessage + 1;
      // dirty write no matter what
      this._newConversationsDirty[convId] = newRec;
      return;
    }

    // - fully read up handling
    this._notif.namespaceItemDeleted(NS_CONVNEW, convId);

    delete this._newConversations[convId];
    // do we have a pending write for this conversation?
    if (this._newConversationsDirty.hasOwnProperty(convId)) {
      // if there's anything written, use a null to mark a delete
      if (this._newConversationsWritten.hasOwnProperty(convId))
        this._newConversationsDirty[convId] = null;
      // otherwise, any pending writes can just be nuked
      else
        delete this._newConversationsDirty[convId];
    }
    // if it's not dirty, then there must be writes to nuke...
    else {
      this._newConversationsDirty[convId] = null;
    }
  },

  _cmd_clearNewness: function(_ignored, details) {
    for (var i = 0; i < details.convNewnessDetails.length; i++) {
      var convDetail = details.convNewnessDetails[i];
      this._mootNewForMessages(convDetail.convId, convDetail.lastNonNewMessage);
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
    return when($Q.all([
        this._db.putCells($lss.TBL_CONNREQ_RECV, othPubring.rootPublicKey,
                          cells),
        this._db.updateMultipleIndexValues($lss.TBL_CONNREQ_RECV,
                                           indexValues)
      ]),
      function() {
        // - notify
        self._notif.namespaceItemAdded(
          NS_CONNREQS, othPubring.rootPublicKey, cells, null, indexValues,
          function(clientData, querySource) {
            return self._convertConnectRequest(
              persistRep, othPubring.rootPublicKey, querySource, clientData);
          });
        self._log.contactRequest(reqmsg.senderKey);
      }); // rejection pass-through is fine
  },

  _cmd_trackOutgoingConnRequest: function(recipRootKey, details) {
    var indexValues = [
      [$lss.IDX_CONNREQ_SENT, '', recipRootKey, details.sentAt],
    ], self = this;
    return when(
      $Q.all([this._db.putCells($lss.TBL_CONNREQ_SENT, recipRootKey, details),
              this._db.updateMultipleIndexValues($lss.TBL_CONNREQ_SENT,
                                                 indexValues)]),
      function() {
        // if there is a phonebook result for this person, let us remove it.
        self._notif.namespaceItemDeleted(NS_POSSFRIENDS, recipRootKey);
    });
  },

  getRootKeysForAllSentContactRequests: function() {
    return when(this._db.scanIndex($lss.TBL_CONNREQ_SENT,
                                   $lss.IDX_CONNREQ_SENT, '',
                                   -1),
      function(rootKeysWithScores) {
        var rootKeys = [];
        for (var i = 0; i < rootKeysWithScores.length; i += 2) {
          rootKeys.push(rootKeysWithScores[i]);
        }
        return rootKeys;
      }); // failure pass-through is fine
  },

  _cmd_rejectContact: function(peepRootKey, ignored) {
    this._nukeConnectRequest(peepRootKey);
  },

  /**
   * Erase a received connection request from our knowledge.  This should be
   *  done when the contact addition command is completed.
   */
  _nukeConnectRequest: function(peepRootKey) {
    var self = this;
    var delIndices = [
      // Current semantics do not require us to have the index's value to
      //  delete it.  This may need to be revisited.
      [$lss.IDX_CONNREQ_RECEIVED, '', peepRootKey, null],
    ];
    return $Q.all([
      this._notif.namespaceItemDeleted(NS_CONNREQS, peepRootKey),
      this._db.deleteMultipleIndexValues($lss.TBL_CONNREQ_RECV, delIndices),
      this._db.deleteRowCell($lss.TBL_CONNREQ_RECV, peepRootKey)
    ]);
  },


  /**
   * Create a peepClientData rep from a self-ident blob; for use in creating
   *  connection requests and possible friend structures (when we don't already
   *  know about the person via some other means).
   *
   * The caller is responsible for adding the returned object to the appropriate
   *  deps list.
   */
  _convertSynthPeep: function(querySource, fullName, selfIdentBlob,
                              selfIdentPayload) {
    var clientData = this._notif.reuseIfAlreadyKnown(
                           querySource, NS_PEEPS, fullName);
    if (clientData)
      return clientData;

    var self = this;
    clientData = this._notif.generateClientData(querySource, NS_PEEPS,
                                                fullName);

    var frontData = this._convertPeepSelfIdentToBothReps(
                      selfIdentBlob, selfIdentPayload, clientData);

    querySource.dataMap[NS_PEEPS][clientData.localName] = frontData;

    return clientData;
  },

  _convertConnectRequest: function(reqRep, fullName, querySource, clientData) {
    // backside data: we need the receivedAt date, we get the rest via the peep
    clientData.data = {
      receivedAt: reqRep.receivedAt
    };

    // - synthesize the peep rep
    var selfIdentPayload = $pubident.peekPersonSelfIdentNOVERIFY(
                             reqRep.selfIdent),
        peepClientData = this._convertSynthPeep(querySource, fullName,
                                                reqRep.selfIdent,
                                                selfIdentPayload);
    clientData.deps.push(peepClientData);

    // - synthesize the peep's server info rep
    var serverIdent = $pubident.peekServerSelfIdentNOVERIFY(
                        selfIdentPayload.transitServerIdent);
    var serverClientData = this._notif.reuseIfAlreadyKnown(
                             querySource, NS_SERVERS,
                             serverIdent.rootPublicKey);
    if (!serverClientData)
      serverClientData = this._convertServerInfo(
                           querySource, serverIdent,
                           selfIdentPayload.transferServerIdent);
    clientData.deps.push(serverClientData);

    return {
      peepLocalName: peepClientData.localName,
      serverLocalName: serverClientData.localName,
      theirPocoForUs: reqRep.theirPocoForUs,
      receivedAt: reqRep.receivedAt,
      messageText: reqRep.messageText,
    };
  },

  _convertServerInfo: function(querySource, serverIdent,
                               serverIdentBlob) {
    var clientData = this._notif.generateClientData(
          querySource, NS_SERVERS, serverIdent.rootPublicKey);
    clientData.data = serverIdentBlob;
    querySource.dataMap[NS_SERVERS][clientData.localName] =
      this._transformServerIdent(serverIdent);

    return clientData;
  },

  /**
   * Transform a server ident blob for transport to a `ModaBridge`.
   */
  _transformServerIdent: function(serverIdent) {
    return {
      url: serverIdent.url,
      displayName: serverIdent.meta.displayName,
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
    return this.runMutexed(function() {
     // XXX try and rejigger this to use _indexScanLookupAndReport
     return when(self._db.scanIndex(
                  $lss.TBL_CONNREQ_RECV, $lss.IDX_CONNREQ_RECEIVED, '', -1),
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
            var fullName = rootKeys[iKey - 1]; // (infinite loop protection)
            clientData = self._notif.generateClientData(
                           querySource, NS_CONNREQS, fullName);

            querySource.dataMap[NS_CONNREQS][clientData.localName] =
              self._convertConnectRequest(reqRep, fullName,
                                          queryHandle.owner, clientData);
            viewItems.push(clientData.localName);
            clientDataItems.push(clientData);
            reqRep = null;
          }
          // (use a while loop so in the event this is a duplicate conn req
          //  query our reuse invocations can fast-path without blowing the
          //  stack on non-tail-call optimized impls.)
          while (iKey < rootKeys.length) {
            if ((clientData = self._notif.reuseIfAlreadyKnown(
                                queryHandle.owner, NS_CONNREQS,
                                rootKeys[iKey]))) {
              viewItems.push(clientData.localName);
              clientDataItems.push(clientData);
              iKey++;
              continue;
            }

            // increment every time to avoid ending up in an infinite loop
            //  in case of data invariant violation
            return when(self._db.getRowCell($lss.TBL_CONNREQ_RECV,
                                            rootKeys[iKey++], 'd:req'),
                        getNextMaybeGot);
          }
          return self._fillOutQueryDepsAndSend(queryHandle);
        }

        return getNextMaybeGot();
      }); // rejection pass-through is desired
    });
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
        break;
      case 'any':
        idx = $lss.IDX_PEEP_ANY_INVOLVEMENT;
        break;
      case 'recip':
        idx = $lss.IDX_PEEP_RECIP_INVOLVEMENT;
        break;
      case 'write':
        idx = $lss.IDX_PEEP_WRITE_INVOLVEMENT;
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

    if (idx === $lss.IDX_PEEP_CONTACT_NAME) {
      queryHandle.cmpFunc = function(aClientData, bClientData) {
        var aVal = assertGetIndexValue(aClientData.indexValues, idx, indexParam),
            bVal = assertGetIndexValue(bClientData.indexValues, idx, indexParam);
        return aVal.localeCompare(bVal);
      };
    }
    else {
      queryHandle.cmpFunc = function(aClientData, bClientData) {
        var aVal = assertGetIndexValue(aClientData.indexValues, idx, indexParam),
            bVal = assertGetIndexValue(bClientData.indexValues, idx, indexParam);

        // make this a deterministic sort by using the fullName to break ties
        var delta = bVal - aVal;
        if (delta)
          return delta;
        if (aClientData.fullName < bClientData.fullName)
          return -1;
        else if (aClientData.fullName > bClientData.fullName)
          return 1;
        else
          return 0;
      };
    }

    return this._indexScanLookupAndReport(
             queryHandle, NS_PEEPS, this._fetchPeepBlurb,
             $lss.TBL_PEEP_DATA, idx, indexParam, scanDir, scanFunc);
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
      // right now we could also just wait for the db increment manipulations
      //  to return and see what the value comes out to.
      numUnread: cells['d:nunread'],
      numConvs: cells['d:nconvs'],
    };

    // -- client data
    var ourPoco = signedOident ?
      $pubident.peekOtherPersonIdentNOVERIFY(signedOident).localPoco : null;

    var selfIdentPayload =
      $pubident.peekPersonSelfIdentNOVERIFY(cells['d:sident']);
    return {
      ourPoco: ourPoco,
      selfPoco: selfIdentPayload.poco,
      numUnread: cells['d:nunread'],
      numConvs: cells['d:nconvs'],
      pinned: false,
      isMe:
        selfIdentPayload.root.rootSignPubKey === this._pubring.rootPublicKey,
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
      numUnread: 0,
      numConvs: 0,
    };
    return {
      ourPoco: null,
      selfPoco: selfIdentPayload.poco,
      numUnread: 0,
      numConvs: 0,
      pinned: false,
      isMe:
        selfIdentPayload.root.rootSignPubKey === this._pubring.rootPublicKey,
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
    // Generate a modified notification because the peep could already be
    //  known to our logic.  If we get better about issuing removals for
    //  peeps exposed via the 'connect requests' and 'make friends' mechanisms,
    //  we can go back to adding, because then the peep really should not
    //  exist at that point.  Keeping the add code around for now to that end.
    /*
    this._notif.namespaceItemAdded(
      NS_PEEPS, peepRootKey, cells, mutatedCells, indexValues,
      this._convertPeepToBothReps.bind(this, cells, mutatedCells));
    */
    this._notif.namespaceItemModified(
      NS_PEEPS, peepRootKey, cells, mutatedCells, indexValues,
      this._convertPeepToBothReps.bind(this, cells, mutatedCells),
      function updatePeepRep(clientData, querySource, frontDataDelta) {
        // we must must must update the oident.
        var signedOident = mutatedCells['d:oident'];
        clientData.data.oident = signedOident;
        var ourPoco =
          $pubident.peekOtherPersonIdentNOVERIFY(signedOident).localPoco;

        frontDataDelta.ourPoco = ourPoco;
      });
  },

  /**
   * Generate notifications for peep blurbs due to new messages in
   *  conversations.  Specifically, modifications for:
   * - the author (write index, any index, optional numUnread delta)
   * - (optional) invitee (any index, may recip, numConvs delta)
   * - the (non-invitee) recipients (any index, maybe recip index)
   */
  _notifyPeepConvDeltas: function(authorRootKey, authorDeltaRep,
                                  recipRootKeys, peepIndexValues,
                                  inviteeRootKey, inviteeDeltaRep) {
    // - notify for the author
    function authorDeltaGen(clientData, querySource, outDeltaRep) {
      // - bail if deferred
      // it's possible this is a deferred load representation, in which case
      //  the query has not been issued, so it's fine to not touch the delta
      //  because the canonical rep will load it in.
      if (!clientData.data)
        return;

      // - update delta
      if (authorDeltaRep.hasOwnProperty('numUnread')) {
        clientData.data.numUnread += authorDeltaRep.numUnread;
        outDeltaRep.numUnread = clientData.data.numUnread;
      }
    }
    this._notif.namespaceItemModified(
      NS_PEEPS, authorRootKey, null, null, peepIndexValues, null,
      authorDeltaRep ? authorDeltaGen : null);
    // - notify for the invitee with a delta if we have
    if (inviteeRootKey) {
      this._notif.namespaceItemModified(
        NS_PEEPS, inviteeRootKey, null, null, peepIndexValues, null,
        function deltaGen(clientData, querySource, outDeltaRep) {
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

  _fetchPeepBlurb: function(querySource, peepRootKey, clientData) {
    // if we don't already have a data-empty structure, create one
    if (!clientData)
      clientData = this._notif.generateClientData(querySource,
                                                  NS_PEEPS, peepRootKey);

    var self = this;
    return when(this._db.getRow($lss.TBL_PEEP_DATA, peepRootKey, null),
                function(cells) {
      querySource.dataMap[NS_PEEPS][clientData.localName] =
                    self._convertPeepToBothReps(cells, null, clientData);
      return clientData;
    });
  },

  /**
   * Resolve the peepRootKey to a local name for the given handle, adding it
   *  to the list of records to look up during the appropriate batch phase if
   *  not already known.
   */
  _deferringPeepQueryResolve: function(querySource, peepRootKey, addToDeps) {
    var clientData = this._notif.reuseIfAlreadyKnown(querySource, NS_PEEPS,
                                                     peepRootKey);
    if (clientData) {
      addToDeps.push(clientData);
      return clientData.localName;
    }

    querySource.dataNeeded[NS_PEEPS].push(peepRootKey);
    clientData = this._notif.generateClientData(querySource, NS_PEEPS,
                                                peepRootKey);
    addToDeps.push(clientData);
    querySource.dirty = true;

    return clientData.localName;
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
    return $Q.all([
      // contact addition mode
      (new $ls_tasks.PeepNameTrackTask(arg, this._log)).run(),
      // update indices per the design call
      this._db.updateIndexValue($lss.TBL_PEEP_DATA,
                                $lss.IDX_PEEP_ANY_INVOLVEMENT,
                                '',
                                peepRootKey, now),
      this._db.updateIndexValue($lss.TBL_PEEP_DATA,
                                $lss.IDX_PEEP_WRITE_INVOLVEMENT,
                                '',
                                peepRootKey, now),
      // delete any existing connection request from the database
      this._nukeConnectRequest(peepRootKey)
    ]);
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
      conversationMeta: {convId: true, nonce: true},
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
