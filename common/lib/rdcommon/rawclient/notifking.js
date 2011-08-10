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
 * Tracks outstanding queries, notifies them about changes, and is also in
 *  charge of maintaining "new" aggregate status objects.
 *
 * @typedef[QuerySource @dict[
 *   @key[name String]{
 *     The identifying name of the query source; must be sufficiently unique
 *     to not collide with any other query sources in this client, but not
 *     globally unique.
 *   }
 *   @key[listener Object]
 *   @key[prefix String]{
 *     Currently unused short unique string, allocated by the king.
 *   }
 *   @key[nextUniqueIdAlloc Number]{
 *     The next unique identifer to allocate to this query source.  While we
 *     currently allocate identifiers from the same pool across all schema
 *     types, we do not need to do so.  Identifiers are retrieved from separate
 *     maps for safety purposes.
 *   }
 *   @key[queryHandlesByNS QueryHandlesByNS]
 * ]]
 *
 * @typedef[LocallyNamedClientData @dict[
 *   @key[localName String]{
 *     The name of the object as known by the moda bridge instance.
 *   }
 *   @key[fullName String]{
 *     The unique identifier for the object, usually the naming crypto key.
 *   }
 *   @key[count]{
 *     The reference count for this client data; when it hits zero, we can tell
 *     the `QuerySource` to forget about this datum.
 *   }
 *   @key[data]{
 *     The actual client data that we might need to react to requests involving
 *     this instance from the moda bridge.
 *
 *     For example, we need/want for each of the following:
 *     - Peeps: Other-person ident, if available; self ident.
 *     - Conversation: Conversation meta structure.
 *   }
 *   @key[indexValues #:optional @dictof[
 *     @key[indexName]
 *     @value[indexValue]
 *   ]]{
 *     Present only when there is a query on an index for this namespace
 *     (there may not be for lookups explicitly by full name).  Only contains
 *     entries for actively queried indices.
 *
 *     The base case is that we issue an index query, keeping the values in
 *     memory and adding them to the ClientData structure.  Then, whenever
 *     modifications occur, the notifications are issued along with all of the
 *     index changes.  During our scan, we update any tracked index values with
 *     the new values, if present.  Updating may be overwrite or maximize based
 *     on the index (type).
 *
 *     Index parameters do not enter into the tracking equation because index
 *   }
 *   @key[deps @listof[ClientData]]{
 *     A list of references to `ClientData` instances which our
 *     QuerySource-side data structures make reference to and so which we need
 *     to keep alive.
 *
 *     When the reference count for this structure hits zero, we should run down
 *     the list of deps and decrement their reference counts, possibly
 *     triggering them to hit zero and also need to convey a deletion to the QS.
 *     Cycles are avoided by a strong requirement that our data model not allow
 *     them.
 *   }
 * ]]
 *
 * @typedef[QueryHandle @dict[
 *   @param[owner QuerySource]
 *   @param[uniqueId]{
 *     `QuerySource`-allocated identifier, unique among other active identifiers
 *     allocated by the QuerySource.
 *   }
 *   @param[namespace QueryNamespace]
 *   @param[queryDef QueryDef]
 *   @param[index]{
 *     The view index that provides the ordering
 *   }
 *
 *   @param[sliceRange]{
 *     Eventually used to allow only viewing a subset of an ordered set because
 *     the set might become large and the UI doesn't need to know about it all
 *     at once.
 *   }
 *
 *   @param[testFunc @func[
 *     @args[
 *       @param[baseCells]{
 *         The set of hbase-style cells that already exist in the database.
 *       }
 *       @param[mutatedCells]{
 *         The set of hbase-style cells that we are writing to the database.
 *       }
 *     ]
 *     @return[Boolean]{
 *       Based on the provided cells, should the described item be in this set?
 *       If access to `queryDef` is required, it should be provided via bind or
 *       a closure.
 *     }
 *   ]]
 *   @param[cmpFunc @func]{
 *     @args[
 *       @param[a LocallyNamedClientData]
 *       @param[b LocallyNamedClientData]
 *     ]
 *     @return[Number]{
 *       Your general comparison function; return zero if `a` and `b` are equal,
 *       return less-than-zero if `a` is less than `b`, and greater-than-zero
 *       otherwise.
 *     }
 *   }
 *
 *   @param[membersByLocal @dictof[
 *     @key[namespace QueryNamespace]
 *     @value[nsMembers @dictof[
 *       @key[trueName String]{
 *         The full, unique-ish name, such as the crypto key value for the item.
 *       }
 *       @value[data LocallyNamedClientData]
 *     ]]
 *   ]]
 *   @param[membersByFull]{
 *     Same as `membersByLocal` but keyed by the full name.
 *   }
 *
 *   @param[dataNeeded]{
 *     The running set of data pieces named by their full name that need to get
 *     loaded before we can call this query loaded.  This is used to consolidate
 *     derived data requests for batching so that we can leverage locality.
 *
 *     The lists should always contain the names of items not yet queried.
 *     In cases where speculative naming is required (ex: peeps), we will
 *     add the peep full id to the dataNeeded list at the same time we add the
 *     empty entry to the members tables.
 *   }
 *
 *   @param[splices @listof[@dict[
 *     @key[index]
 *     @key[howMany]
 *     @key[items]
 *   ]]]{
 *     Splice information, currently structured as a dict for clarity and
 *     because we may change things up to the full wmsy viewslice proto later
 *     on.
 *   }
 *   @param[dataMap @dictof[
 *     @key[namespace QueryNamespace]
 *     @value[@dictof[
 *       @key[id QSNSId]
 *       @value[dataVal Boolean]{
 *         If non-null, a new data value to be aware of and stored/used.  If
 *         null, indicates the name and its value should be removed from the
 *         query cache.  The notification king keeps reference counts on behalf
 *         of the bridge side, and so is able to make the stop caching decision
 *         for it.
 *       }
 *     ]]
 *   ]]{
 *     The set of full representation data to send across the wire to moda.  The
 *     representation is namespace dependent and specialized (read: not the
 *     database cells).  The map is reset after being sent to the front-side;
 *     the back-side does not continue to hold onto it.
 *   }
 *   @param[dataDelta @dictof[
 *   ]]{
 *     Deltas conveying specific changes to affect on the front-side moda
 *     representations.  For example, if the number of conversations a peep is
 *     involved in changes, we just send the difference across the wire rather
 *     than resending the other data about the peep.  This is done both for
 *     efficiency and because the back-side may no longer have all the
 *     information the front-side needs/uses when the change occurs.
 *   }
 * ]]
 * @typedef[QueryNamespace @oneof[
 *   NS_PEEPS
 *   NS_CONVBLURBS
 *   NS_CONVALL
 * ]]
 * @typedef[QueryHandlesByNS @dictof[
 *   @key[namespace QueryNamespace]
 *   @value[@listof[QueryHandle]]
 * ]]
 **/

define(
  [
    'rdcommon/log',
    'module',
    'exports'
  ],
  function(
    $log,
    $module,
    exports
  ) {

const NS_PEEPS = exports.NS_PEEPS = 'peeps',
      NS_CONVBLURBS = exports.NS_CONVBLURBS = 'convblurbs',
      NS_CONVALL = exports.NS_CONVALL = 'convall';

/**
 * There is no pending message that must be sent regarding this query.
 */
const PENDING_NONE = 0,
/**
 * We are in the initial query population stage; we owe the initial results
 *  message.
 */
      PENDING_INITIAL = 1,
/**
 * We have seen a delta that demands a notification event be sent.
 */
      PENDING_NOTIF = 2;

function makeEmptyListsByNS() {
  return {
    peeps: [],
    convblurbs: [],
    convall: [],
  };
};

function makeEmptyMapsByNS() {
  return {
    peeps: {},
    convblurbs: {},
    convall: {},
  };
};

function funcThatJustReturnsFalse() {
  return false;
}
// this is our dummy comparator/sort func
function funcThatJustReturnsZero() {
  return 0;
};

/**
 * Perform a binary search on an array to find the correct insertion point
 *  in the array for an item.  Tested in `unit-simple-algos.js`.
 *
 * @return[Number]{
 *   The correct insertion point in the array, thereby falling in the inclusive
 *   range [0, arr.length].
 * }
 */
var bsearchForInsert = exports._bsearchForInsert =
    function bsearchForInsert(list, seekVal, cmpfunc) {
  if (!list.length)
    return 0;
  var low  = 0, high = list.length - 1,
      mid, cmpval;
  while (low <= high) {
    mid = low + Math.floor((high - low) / 2);
    cmpval = cmpfunc(seekVal, list[mid]);
    if (cmpval < 0)
      high = mid - 1;
    else if (cmpval > 0)
      low = mid + 1;
    else
      break;
  }
  if (cmpval < 0)
    return mid; // insertion is displacing, so use mid outright.
  else if (cmpval > 0)
    return mid + 1;
  else
    return mid;
};

/**
 * Tracks outstanding queries, notifies them about changes, and is also in
 *  charge of maintaining "new" aggregate status objects.
 *
 * Design-influencing assumptions:
 * - Moda bridges will have a small number of outstanding queries at any time,
 *    making looping over the set of queries a reasonable cost versus needing
 *    to provide a union summary.  A bloom-esque hash might be appropriate if
 *    things are deemed to be slow.
 * - The number of outstanding moda bridge instances will be small, likely 1,
 *    on wimpy devices.
 *
 * Memory management works like so (and is similar to the gloda model):
 * - All queries have a per-namespace map of id's to the relevant server side
 *    info and serves an indicator that the user-facing data is known (or
 *    in-flight to) the UI thread.
 * - The server side info includes reference counts so that we can know when
 *    to forget about the entry locally and also be able to tell the bridge
 *    when it can forget about things to.  The alternative to this would be
 *    implementing our own graph-traversing garbage collection based on the
 *    roots of what the items included in the ordered set are.  Arguably, this
 *    would be similar to the local traversal knowledge required to be able to
 *    increment/decrement the reference counts, but we're using reference
 *    counts.  An upside to this is it's slightly easier for unit tests to
 *    verify logic correctness since we can check the count versus gc logic
 *    which will be more boolean.  Using weak references when they become
 *    pervasive may end up being a better mechanism; although we would still
 *    need to perform a pass to find out what weak references are now empty so
 *    we can generate the deletion notifications to the bridge.
 * - Queries are kept alive by the assumption that the user-facing thread/query
 *    source is still alive and would have told us prior to going away.  Some
 *    type of heartbeat mechanism might be an appropriate sanity-checking
 *    backstop.  (In unit tests we would manually cause heartbeats and heartbeat
 *    checks to occur.)
 *
 * Cache management:
 * - We only hold onto the server-facing side of the data on this side of the
 *    bridge, as noted in memory management.
 * - We know if the user-facing data is already available on the other side of
 *    the bridge based on one of its queries already having the id present.
 * - If the user-facing side doesn't know about the data, we need to issue a
 *    db request to get the data and send it across.  Although we get the
 *    server-facing data from this, we avoid clobbering our in-memory state if
 *    it already knows the data to avoid accidental rollback of data.  (Likewise
 *    we double check before transmitting the user-data.)
 */
function NotificationKing(store, _logger) {
  this._log = LOGFAB.notificationKing(this, _logger);
  this._store = store;

  this._highPrefixNum = 0;

  // sources and their queries
  this._activeQuerySources = {};
}
exports.NotificationKing = NotificationKing;
NotificationKing.prototype = {
  toString: function() {
    return '[NotificationKing]';
  },
  toJSON: function() {
    return {type: 'NotificationKing'};
  },

  //////////////////////////////////////////////////////////////////////////////
  // Queries from Moda / Elsewhere

  /**
   * Register a new thing that will issue queries and wants notifications,
   *  returning a unique identifier prefix that must be used for all queries
   *  registered in the future.
   */
  registerNewQuerySource: function(verboseUniqueName, listener) {
    var prefixNum, prefixId;
    // XXX the prefix stuff is currently moot, may be used again soon...
    // we can have up to 17576 active query sources with this mechanism.  this
    //  is less chosen for active query sources and more to avoid reuse of
    //  identifiers to simplify testing situations.  not a biggie to change.
    while (true) {
      prefixNum = this._highPrefixNum++;
      prefixId =
        String.fromCharCode(97 + (Math.floor(prefixNum / (26 * 26)) % 26)) +
        String.fromCharCode(97 + (Math.floor(prefixNum / 26) % 26)) +
        String.fromCharCode(97 + (prefixNum % 26));
      if (!this._activeQuerySources.hasOwnProperty(prefixId))
        break;
    }
    var querySource = this._activeQuerySources[prefixId] = {
      name: verboseUniqueName,
      listener: listener,
      prefix: prefixId,
      nextUniqueIdAlloc: 0,
      queryHandlesByNS: makeEmptyListsByNS(),
    };
    return querySource;
  },

  /**
   * Report that a previously registered query source is dead and all of its
   *  tracked queries should be killed.
   */
  unregisterQuerySource: function(verboseUniqueName) {
    // XXX implement (with tests tracking dead and ensuring no notifications)
  },

  /**
   * Register a new query that is being issued and wants to hear about changes
   *  to its results (once received) and any new valid results once the results
   *  have been received.
   *
   * @return[QueryHandle]
   */
  newTrackedQuery: function(querySource, uniqueId, namespace, queryDef) {
    this._log.queryFill_begin(namespace, uniqueId);
    var queryHandle = {
      owner: querySource,
      uniqueId: uniqueId,
      namespace: namespace,
      pending: PENDING_INITIAL,
      //
      queryDef: queryDef,
      index: null,
      // currently we don't subset view slices, so there is always no bound.
      sliceRange: {
        low: null,
        high: null,
      },
      testFunc: funcThatJustReturnsFalse,
      cmpFunc: funcThatJustReturnsZero,
      membersByFull: makeEmptyMapsByNS(),
      membersByLocal: makeEmptyMapsByNS(),
      // - data yet required (from dependencies)
      dataNeeded: makeEmptyListsByNS(),
      // - data to send over the wire once this round is done
      splices: [],
      dataMap: makeEmptyMapsByNS(),
      dataDelta: makeEmptyMapsByNS(),
    };
    querySource.queryHandlesByNS[namespace].push(queryHandle);
    return queryHandle;
  },

  forgetTrackedQuery: function(queryHandle) {
    var qhList = queryHandle.owner.queryHandlesByNS[queryHandle.namespace];
    var qhIndex = qhList.indexOf(queryHandle);
    if (qhIndex === -1)
      throw new Error("Query handle life-cycle violation; does not exist!");
    qhList.splice(qhIndex, 1);
  },


  //////////////////////////////////////////////////////////////////////////////
  // Transmission to the bridge
  sendQueryResults: function(queryHandle) {
    var isInitial = (queryHandle.pending === PENDING_INITIAL);
    var msg = {
      handle: queryHandle.uniqueId,
      op: isInitial ? 'initial' : 'update',
      splices: queryHandle.splices,
      dataMap: queryHandle.dataMap,
      dataDelta: queryHandle.dataDelta,
    };
    // - reset state
    queryHandle.pending = PENDING_NONE;
    queryHandle.dataNeeded = makeEmptyListsByNS();
    queryHandle.splices = [];
    queryHandle.dataMap = makeEmptyMapsByNS();
    queryHandle.dataDelta = makeEmptyMapsByNS();

    if (isInitial)
      this._log.queryFill_end(queryHandle.namespace, queryHandle.uniqueId);

    queryHandle.owner.listener.send(msg);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Cache checks

  /**
   * Check if the query source associated with the query handle already knows
   *  about the named item in question.  If so, increment the client data
   *  structure's count, put it in the members table, and return it.  Returns
   *  null if the item was not yet known.
   *
   * @args[
   *   @param[writeQueryHandle QueryHandle]
   *   @param[namespace]
   *   @param[fullId]
   * ]
   */
  reuseIfAlreadyKnown: function(writeQueryHandle, namespace, fullId) {
    // fast-path if the given query already knows the answer
    var clientData;
    if (writeQueryHandle.membersByFull[namespace].hasOwnProperty(fullId)) {
      clientData = writeQueryHandle.membersByFull[namespace];
      clientData.count++;
      return clientData;
    }

    // scan other queries
    var querySource = writeQueryHandle.owner;
    var queryHandles = querySource.queryHandlesByNS[namespace];
    for (var iQuery = 0; iQuery < queryHandles.length; iQuery++) {
      var queryHandle = queryHandles[iQuery];
      if (queryHandle === writeQueryHandle)
        continue;
      var nsMembers = queryHandle.membersByFull[namespace];
      if (nsMembers.hasOwnProperty(fullId)) {
        clientData = nsMembers[fullId];
        clientData.count++;
        writeQueryHandle.membersByLocal[namespace][clientData.localName] =
          writeQueryHandle.membersbyFull[namespace][clientData.fullName] =
            clientData;
        return clientData;
      }
    }
    return null;
  },

  mapLocalNameToFullName: function(querySource, namespace, localName) {
    var queryHandles = querySource.queryHandlesByNS[namespace];
    for (var iQuery = 0; iQuery < queryHandles.length; iQuery++) {
      var queryHandle = queryHandles[iQuery];
      var nsMembers = queryHandle.membersByLocal[namespace];
      if (nsMembers.hasOwnProperty(localName)) {
        return nsMembers[localName].fullName;
      }
    }
    throw new Error("No such local name '" + localName + "'");
  },

  //////////////////////////////////////////////////////////////////////////////
  // Message Notifications from LocalStore
  //
  // Specialized message notification handling; required because the aggregation
  //  of messages into conversations is unique within our system.

  /**
   * XXX speculative, probably should be nuked or moved
   *
   * Track a message that appears to be new but we won't know for sure until we
   *  are done with our update phase (because it might be marked read by a later
   *  replica block).
   */
  trackNewishMessage: function(convId, msgIndex, msgData) {
    var newishForConv;
    if (!this._newishMessagesByConvId.hasOwnProperty(convId))
      newishForConv = this._newishMessagesByConvId[convId] = [];
    else
      newishForConv = this._newishMessagesByConvId[convId];
    newishForConv.push({index: msgIndex, data: msgData});
  },

  /**
   * XXX speculative, probably should be nuked or moved
   *
   * Moot potential new message events in the given conversation.
   */
  mootNewForMessages: function(convId, firstUnreadMessage) {
    if (!this._newishMessagesByConvId.hasOwnProperty(convId))
      return;
    var newishForConv = this._newishMessagesByConvId[convId];
    var killUntil = 0;
    while (newishForConv[killUntil].index < firstUnreadMessage) {
      killUntil++;
    }
    if (killUntil === newishForConv.length)
      delete this._newishMessagesByConvId[convId];
    else if (killUntil)
      newishForConv.splice(0, killUntil);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Generic Notifications from LocalStore

  /**
   * Find out if there are any queries that care about the item in question
   *  so the caller can determine if it needs to perform additional lookups
   *  in order to generate a proper notification.
   */
  checkForInterestedQueries: function(namespace) {
    for (var qsKey in this._activeQuerySources) {
      var querySource = this._activeQuerySources[qsKey];
      var queryHandles = querySource.queryHandlesByNS[namespace];

      for (var iQuery = 0; iQuery < queryHandles.length; iQuery++) {
        var queryHandle = queryHandles[iQuery];
      }
    }
  },

  /**
   * Find queries potentially affected by a change.
   *
   * Basic strategy (for each query source):
   * - Fast bail if there are no queries for the namespace.
   * - Map the name of the changed item into the query source namespace,
   *    coincidentally determining if it is already present in any queries.
   * - Loop over the queries:
   *   - see if the query's test function matches the item
   *   - infer add/modified/removed based on whether the item was already known
   *      to the query and the reslt of the test invocation
   *   - if the query has ordered results, figure out the new view index,
   *      generate a splice if there was a change/this is an addition.
   */
  _findAffectedQueries: function(namespace) {
  },

  /**
   * We are now up-to-speed and should generate any notifications we were
   *  holding off on because we were concerned a subsequent update would have
   *  mooted the notification.
   *
   * Update phases are defined as:
   * - When we first connect to the server until we work through our backlog.
   */
  updatePhaseDoneReleaseNotifications: function() {
    var store = this._store;

    // -- generate new message notifications
    for (var convId in this._newishMessagesByConvId) {
      var newishForConv = this._newishMessagesByConvId[convId];

      var msgDataItems = [];
      for (var i = 0; i < newishForConv.length; i++) {
        msgDataItems.push(newishForConv[i].data);
      }

      store.__notifyNewMessagesInConversation(convId, msgDataItems);
    }
  },

  /**
   * A completely new-to-us peep/whatever has come into existence.  The new
   *  thing needs to be checked for eligible sets and update any live queries.
   *
   * XXX make sure deps get entangled
   *
   * @args[
   *   @param[namespace]
   *   @param[fullName]
   *   @param[baseCells]{
   *     The set of cells that already exist in storage, if any.
   *   }
   *   @param[mutatedCells]{
   *     The new set of cells being written, with null values conveying a
   *     cell deletion.
   *   }
   *   @param[indexValues @dictof[
   *     @key[indexName]
   *     @value[indexValue]
   *   ]]{
   *     The set of index values being used for the item.  Index values are
   *     only used if there is a query against the index.  Once used, we
   *     track the
   *   }
   * ]
   */
  namespaceItemAdded: function(namespace, fullName, baseCells, mutatedCells,
                               indexValues) {
    for (var qsKey in this._activeQuerySources) {
      var querySource = this._activeQuerySources[qsKey];
      var queryHandles = querySource.queryHandlesByNS[namespace];

      for (var iQuery = 0; iQuery < queryHandles.length; iQuery++) {
        var queryHandle = queryHandles[iQuery];
        if (queryHandle.testFunc(queryHandle.queryDef,
                                 baseCells, mutatedCells)) {
          // - find the splice point
          var insertIdx = bsearchForInsert(arr, seekVal, cmpfunc);

          // - generate a splice

        }
      }
    }
  },

  /**
   * Something we already knew about has changed.  This may affect its
   *  eligibility for live query sets and should notify all queries it already
   *  is known to/being watched on.
   *
   * We check:
   * - If the indexed value used by any queries has changed.
   * - If a query's test result changes to merit addition/removal.
   */
  namespaceItemModified: function(namespace, name,
                                  baseCells, mutatedCells,
                                  indexValuesModified) {

  },
  /**
   * Something known to us has been deleted from the system or otherwise should
   *  now be treated as completely unknown to us.
   */
  namespaceItemDeleted: function(namespace, name, item) {
  },

  registerNamespaceQuery: function(namespace, name, query) {
  },
  discardNamespaceQuery: function(namespace, name) {
  },

  //////////////////////////////////////////////////////////////////////////////
};

var LOGFAB = exports.LOGFAB = $log.register($module, {
  notificationKing: {
    asyncJobs: {
      queryFill: {namespace: true, uniqueId: true},
    },
  },
});

}); // end define
