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
 *   @key[allQueryHandles]
 *   @key[pending @listof[QueryHandle]]{
 *     The set of queries that have pending data to be sent.
 *   }
 * ]]
 *
 * @typedef[IndexValues @listof[@list[
 *   @param[indexName]
 *   @param[indexParam]
 *   @param[objectName]
 *   @param[newValue]
 * ]]]
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
 *   @key[indexValues #:optional IndexValues]{
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
 *   @param[indexParam]{
 *     The index parameter value in use.
 *   }
 *
 *   @param[sliceRange]{
 *     Eventually used to allow only viewing a subset of an ordered set because
 *     the set might become large and the UI doesn't need to know about it all
 *     at once.
 *   }
 *   @param[items @listof[LocallyNamedClientData]]{
 *     The items in the view in their sorted order.
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
 *       @param[fullName]
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
 *   NS_CONVMSGS
 *   NS_SERVERS
 *   NS_CONNREQS
 *   NS_ERRORS
 * ]]
 * @typedef[QueryHandlesByNS @dictof[
 *   @key[namespace QueryNamespace]
 *   @value[@listof[QueryHandle]]
 * ]]
 **/

define(
  [
    'q',
    'rdcommon/log',
    'module',
    'exports'
  ],
  function(
    $Q,
    $log,
    $module,
    exports
  ) {
const when = $Q.when;

const NS_PEEPS = exports.NS_PEEPS = 'peeps',
      NS_CONVBLURBS = exports.NS_CONVBLURBS = 'convblurbs',
      NS_CONVMSGS = exports.NS_CONVMSGS = 'convmsgs',
      NS_SERVERS = exports.NS_SERVERS = 'servers',
      NS_CONNREQS = exports.NS_CONNREQS = 'connreqs',
      NS_ERRORS = exports.NS_ERRORS = 'errors',
      // dependent namespaces that need to be checked for updates
      DEP_NAMESPACES = [NS_PEEPS, NS_SERVERS],
      // namespaces that can have dependencies on the above namespaces.
      // nb: NS_CONNREQS populates its peeps itself and they never get updates,
      //  so it is not included in this list.
      DEP_HAVING_NAMESPACES = [NS_CONVBLURBS, NS_CONVMSGS],
      // namespaces that can be dispatched immediately without waiting for an
      //  update phase
      IMMED_NAMESPACES = [NS_ERRORS];

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
    convmsgs: [],
    servers: [],
    connreqs: [],
    errors: [],
  };
};

function makeEmptyMapsByNS() {
  return {
    peeps: {},
    convblurbs: {},
    convmsgs: {},
    servers: {},
    connreqs: {},
    errors: {},
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
const bsearchForInsert = exports._bsearchForInsert =
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

const setIndexValue = exports.setIndexValue =
    function setIndexValue(indexValues, indexName, indexParam, val) {
  for (var i = 0; i < indexValues.length; i++) {
    var ival = indexValues[i];
    if (ival[0] === indexName && ival[1] === indexParam) {
      ival[3] = val;
      return;
    }
  }
  // The object name does not matter for the in-memory representation.
  //  (We just have that spot for consistency with the database writes.)
  indexValues.push([indexName, indexParam, null, val]);
};

const setReuseIndexValue = exports.setReuseIndexValue =
    function setReuseIndexValue(indexValues, setVal) {
  var indexName = setVal[0], indexParam = setVal[1];
  for (var i = 0; i < indexValues.length; i++) {
    var ival = indexValues[i];
    if (ival[0] === indexName && ival[1] === indexParam) {
      ival[3] = val;
      return;
    }
  }
  // did not exist yet, append the existing rep
  indexValues.push(setVal);
};

const transferIndexValue = exports.transferIndexValue =
    function transferIndexValue(srcIndexValues, targIndexValues,
                                      indexName, indexParam) {
  var i, ival, setVal = null;
  for (i = 0; i < srcIndexValues.length; i++) {
    ival = srcIndexValues[i];
    if (ival[0] === indexName && ival[1] === indexParam) {
      setVal = ival;
      break;
    }
  }
  if (setVal === null)
    return false;

  for (i = 0; i < targIndexValues.length; i++) {
    ival = targIndexValues[i];
    if (ival[0] === indexName && ival[1] === indexParam) {
      // if the values are already the same, no transfer technically takes place
      if (ival[3] === setVal[3])
        return false;
      ival[3] = setVal[3];
      return true;
    }
  }
  targIndexValues.push(setVal);
  return true;
};

const assertTransferIndexValue = exports.assertTransferIndexValue =
    function assertTransferIndexValue(srcIndexValues, targIndexValues,
                                      indexName, indexParam) {
  var i, ival, setVal = null;
  for (i = 0; i < srcIndexValues.length; i++) {
    ival = srcIndexValues[i];
    if (ival[0] === indexName && ival[1] === indexParam) {
      setVal = ival;
      break;
    }
  }
  if (setVal === null)
    throw new Error("No source index value matching [" + indexName + ", " +
                    indexParam + ", ...]!");

  for (i = 0; i < targIndexValues.length; i++) {
    ival = targIndexValues[i];
    if (ival[0] === indexName && ival[1] === indexParam) {
      ival[3] = setVal[3];
      return;
    }
  }
  targIndexValues.push(setVal);
};

const getIndexValue = exports.getIndexValue =
    function getIndexValue(indexValues, indexName, indexParam) {
  for (var i = 0; i < indexValues.length; i++) {
    var ival = indexValues[i];
    if (ival[0] === indexName && ival[1] === indexParam) {
      return ival[3];
    }
  }
  return null;
};

const assertGetIndexValue = exports.assertGetIndexValue =
    function assertGetIndexValue(indexValues, indexName, indexParam) {
  for (var i = 0; i < indexValues.length; i++) {
    var ival = indexValues[i];
    if (ival[0] === indexName && ival[1] === indexParam) {
      return ival[3];
    }
  }
  throw new Error("No index value matching [" + indexName + ", " + indexParam +
                  ", ...]!");
};

/**
 * Merge the `mutatedCells` on top of `baseCells`, attempting to maintain the
 *  ordering of baseCells with all the extra bits added afterwards.
 */
const mergeCells = exports.mergeCells =
    function mergeCells(baseCells, mutatedCells) {
  var oot = {}, key; // canadian for "out"
  for (key in baseCells) {
    if (mutatedCells.hasOwnProperty(key))
      oot[key] = mutatedCells[key];
    else
      oot[key] = baseCells[key];
  }
  for (key in mutatedCells) {
    if (!oot.hasOwnProperty(key))
      oot[key] = mutatedCells[key];
  }
  return oot;
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

  this._newishMessagesByConvId = {};

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
      // eh, collisions don't matter since this doesn't matter
      //if (!this._activeQuerySources.hasOwnProperty(prefixId))
        break;
    }
    var querySource = this._activeQuerySources[verboseUniqueName] = {
      name: verboseUniqueName,
      listener: listener,
      prefix: prefixId,
      nextUniqueIdAlloc: 0,
      queryHandlesByNS: makeEmptyListsByNS(),
      allQueryHandles: [],
      pending: [],
    };
    return querySource;
  },

  /**
   * Report that a previously registered query source is dead and all of its
   *  tracked queries should be killed.
   */
  unregisterQuerySource: function(verboseUniqueName) {
    // XXX implement (with tests tracking dead and ensuring no notifications)
    // Note: it is possible there will still be async operations in flight.  We,
    //  fingers-crossed, believe those async operations should still have
    //  references to the queryHandles so the removal of this entry should
    //  not result in exceptions getting thrown everywhere.  Having said that,
    //  it would be nice to aggressively kill or encourage seppuku of all
    //  outstanding queries.
    delete this._activeQuerySources[verboseUniqueName];
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
      indexParam: null,
      // currently we don't subset view slices, so there is always no bound.
      sliceRange: {
        low: null,
        high: null,
      },
      items: [],
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
    querySource.allQueryHandles.push(queryHandle);
    return queryHandle;
  },

  getQueryHandleByUniqueId: function(querySource, namespace, uniqueId) {
    var handles = querySource.queryHandlesByNS[namespace];
    for (var i = 0; i < handles.length; i++) {
      if (handles[i].uniqueId === uniqueId)
        return handles[i];
    }
    throw new Error("No query handle with unique id '" + uniqueId +
                    "' in namespace '" + namespace + "'");
  },

  forgetTrackedQuery: function(queryHandle) {
    // remove from per-namespace list
    var qhList = queryHandle.owner.queryHandlesByNS[queryHandle.namespace];
    var qhIndex = qhList.indexOf(queryHandle);
    if (qhIndex === -1)
      throw new Error("Query handle life-cycle violation; does not exist!");
    qhList.splice(qhIndex, 1);

    // remove from the big list
    qhList = queryHandle.owner.allQueryHandles;
    qhIndex = qhList.indexOf(queryHandle);
    qhList.splice(qhIndex, 1);
  },


  //////////////////////////////////////////////////////////////////////////////
  // Transmission to the bridge

  sendQueryResults: function(queryHandle) {
    var isInitial = (queryHandle.pending === PENDING_INITIAL);
    var msg = {
      type: 'query',
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

    this._log.sendQueryResults(queryHandle.uniqueId, msg);
    queryHandle.owner.listener.send(msg);
  },

  /**
   * Report that something bad happened vis-a-vis the query and it will never
   *  be completed.  This function does its job then formulates an exception
   *  and returns it so the caller can throw our result.
   *
   * Right now, we don't do any query communication about this, because the
   *  exception should be converted into an exception and
   */
  badQuery: function(queryHandle, msg) {
    this._log.badQuery(queryHandle.uniqueId, msg);
    return new Error("Bad Query: " + msg);
  },

  sendMessageToAll: function(msg) {
    for (var qsKey in this._activeQuerySources) {
      var querySource = this._activeQuerySources[qsKey];
      querySource.listener.send(msg);
    }
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
   * @return[LocallyNamedClientData]
   */
  reuseIfAlreadyKnown: function(writeQueryHandle, namespace, fullId) {
    // fast-path if the given query already knows the answer
    var clientData;
    if (writeQueryHandle.membersByFull[namespace].hasOwnProperty(fullId)) {
      clientData = writeQueryHandle.membersByFull[namespace][fullId];
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
          writeQueryHandle.membersByFull[namespace][clientData.fullName] =
            clientData;
        // put a null in the data-map so the client knows to grab the value
        //  from its cache.
        writeQueryHandle.dataMap[namespace][clientData.localName] = null;
        return clientData;
      }
    }
    return null;
  },

  /**
   * Map a local name (a stringified number) in a query source back to its full
   *  name (the naming crypto key / other).  Primarily used by unit tests to
   *  get names the logging system can humanize from the otherwise largely
   *  useless local names.
   */
  mapLocalNameToFullName: function(querySource, namespace, localName) {
    var queryHandles = querySource.allQueryHandles;
    for (var iQuery = 0; iQuery < queryHandles.length; iQuery++) {
      var queryHandle = queryHandles[iQuery];
      var nsMembers = queryHandle.membersByLocal[namespace];
      if (nsMembers.hasOwnProperty(localName)) {
        return nsMembers[localName].fullName;
      }
    }
    throw new Error("No such local name '" + localName + "'");
  },

  /**
   * Map a local name (a stringified number) in a query source to the associated
   *  `LocallyNamedClientData` structure for that query source.
   */
  mapLocalNameToClientData: function(querySource, namespace, localName) {
    var queryHandles = querySource.allQueryHandles;
    for (var iQuery = 0; iQuery < queryHandles.length; iQuery++) {
      var queryHandle = queryHandles[iQuery];
      var nsMembers = queryHandle.membersByLocal[namespace];
      if (nsMembers.hasOwnProperty(localName)) {
        return nsMembers[localName];
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
   * Omnibus generation of message-related notifications based on being told
   *  about all conversation messages (both joins and human messages).
   *
   * The following namespaces derive their notifications from us:
   * - newness: XXX notyet; notifications about new messages/conversations
   * - convmsgs: the queries on the messages in a conversation.
   *
   * We update all queries immediately, although they will not be flushed to
   *  the moda layer until `updatePhaseDoneReleaseNotifications` is invoked.
   *  This coalesces notifications without significantly complicating our
   *  logic.
   */
  trackNewishMessage: function(convId, msgNum, msgRec, baseCells,
                               mutatedCells) {
    var newishForConv;
    // -- newness tracking
// this is speculative logic...
/*
    if (!this._newishMessagesByConvId.hasOwnProperty(convId))
      newishForConv = this._newishMessagesByConvId[convId] = [];
    else
      newishForConv = this._newishMessagesByConvId[convId];
    newishForConv.push({index: msgIndex, rec: msgRec});
*/

    // -- update NS_CONVMSGS queries
    // we can skip out early since you can't have a query about a conversation
    //  you've never heard of.
    if (msgNum === 1)
      return;
    for (var qsKey in this._activeQuerySources) {
      var querySource = this._activeQuerySources[qsKey];
      var queryHandles = querySource.queryHandlesByNS[NS_CONVMSGS];

      for (var iQuery = 0; iQuery < queryHandles.length; iQuery++) {
        var queryHandle = queryHandles[iQuery];
        if (queryHandle.queryDef.convId !== convId)
          continue;

        var clientData = queryHandle.membersByFull[NS_CONVMSGS][convId],
            localName = clientData.localName, outMessages;
        switch (queryHandle.pending) {
          case PENDING_INITIAL:
            outMessages = queryHandle.dataMap[NS_CONVMSGS][localName].messages;
            break;
          case PENDING_NOTIF:
            // It's possible / likely that a dependent object (like our blurb)
            //  will cause us to enter this state, so dataDelta may not actually
            //  be populated if we are here.
            if (queryHandle.dataDelta[NS_CONVMSGS].hasOwnProperty(localName)) {
              outMessages =
                queryHandle.dataDelta[NS_CONVMSGS][localName].messages;
            }
            else {
              queryHandle.dataDelta[NS_CONVMSGS][localName] = {
                messages: (outMessages = []),
              };
            }
            break;
          case PENDING_NONE:
            queryHandle.dataDelta[NS_CONVMSGS][localName] = {
              messages: (outMessages = []),
            };
            queryHandle.pending = PENDING_NOTIF;
            querySource.pending.push(queryHandle);
            break;
        }

        // this is a synchronous operation that may introduce new peeps
        //  dependencies that will be resolved by _fillOutQueryDepsAndSend.
        var converted = this._store._convertConversationMessages(
                          queryHandle, [msgRec], clientData.deps);
        outMessages.splice(outMessages.length, 0, converted[0]);
      }
    }
  },

  /**
   * XXX speculative, probably should be nuked or moved
   *
   * Moot potential new message events in the given conversation.
   */
  mootNewForMessages: function(convId, firstUnreadMessage) {
    return;
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
  //
  // Basic strategy (for each query source):
  // - Fast bail if there are no queries for the namespace.
  // - Map the name of the changed item into the query source namespace,
  //    coincidentally determining if it is already present in any queries.
  // - Loop over the queries:
  //   - see if the query's test function matches the item
  //   - infer add/modified/removed based on whether the item was already known
  //      to the query and the reslt of the test invocation
  //   - if the query has ordered results, figure out the new view index,
  //      generate a splice if there was a change/this is an addition.

  /**
   * We are now up-to-speed and should generate any notifications we were
   *  holding off on because of either a) we wanted to aggregate a potentially
   *  large number of changes, or b) we figured some things might get mooted
   *  like "new" message notifications.
   *
   * Update phases are defined as:
   * - When we first connect to the server until we work through our backlog.
   */
  updatePhaseDoneReleaseNotifications: function() {
    // - release pending queries
    for (var qsKey in this._activeQuerySources) {
      var querySource = this._activeQuerySources[qsKey];

      // we have 2 queues for now: see `trackNewishMessage` and its comment
      while (querySource.pending.length) {
        // (we need to use shift to avoid inverting the ordering)
        var queryHandle = querySource.pending.shift();

        // a promise is returned if we go async
        var sendResult;
        if ((sendResult = this._store._fillOutQueryDepsAndSend(queryHandle))) {
          // In order to ensure that the queries are released in the sequential
          //  order they were added, defer the rest of our execution until the
          //  thing gets sent.  (We are doing this mainly for unit tests, but
          //  it's conceivable this could be very beneficial for moda bridge
          //  consumers that are not carefully written.)
          var self = this;
          return when(sendResult,
                      this.updatePhaseDoneReleaseNotifications.bind(this),
                      function(err) {
                        self._log.errorDuringReleaseNotifications(err);
                      });
        }
      }
    }
    return undefined;
  },

  /**
   * A completely new-to-us peep/whatever has come into existence.  The new
   *  thing needs to be checked for eligible sets and update any live queries.
   *
   * XXX make sure deps get entangled.  (This is not a problem yet since we are
   *  peeps only and they lack deps.)
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
   *   @param[indexValues IndexValues]
   *   @param[optFrontData @oneof[Object Function]]{
   *     The client-side representation of the data OR a function that takes
   *     a `ClientData` structure whose 'data' field should be filled-in with
   *     the back-end representation and whose return value should be the
   *     front-end representation.  The function is only invoked once per
   *     query source since the representations can be reused by other queries
   *     belonging to the same query source.
   *   }
   *   @param[optBackData]{
   *     The back-side representation of the data;
   *   }
   * ]
   */
  namespaceItemAdded: function(namespace, fullName,
                               baseCells, mutatedCells, indexValues,
                               optFrontData, optBackData) {
    var clientDataPopulater;
    if (typeof(optFrontData) === 'function')
      clientDataPopulater = optFrontData;
    else
      clientDataPopulater = function(clientData) {
        clientData.data = optBackData;
        return optFrontData;
      };
    for (var qsKey in this._activeQuerySources) {
      var querySource = this._activeQuerySources[qsKey];
      var queryHandles = querySource.queryHandlesByNS[namespace];

      var localName = null, clientData = null, frontData = null;

      for (var iQuery = 0; iQuery < queryHandles.length; iQuery++) {
        var queryHandle = queryHandles[iQuery];
        if (!queryHandle.testFunc(baseCells, mutatedCells, fullName))
          continue;

        // - ensure client data exists
        if (!clientData) {
          localName = "" + (querySource.nextUniqueIdAlloc++);
          clientData = {
            localName: localName,
            fullName: fullName,
            count: 1,
            // gets filled in by clientDataPopulater
            data: null,
            // starts out empty; we push indices in that are actually used
            indexValues: [],
            // XXX dep propagation (we should either pass in the names or
            //  have the caller explicitly speak to us about a specific
            //  querysource so we can just consume existing clientdata
            //  references)
            deps: [],
          };
          frontData = clientDataPopulater(clientData, queryHandle);
        }
        else {
          clientData.count++;
        }
        queryHandle.membersByLocal[namespace][localName] = clientData;
        queryHandle.membersByFull[namespace][fullName] = clientData;

        queryHandle.dataMap[namespace][localName] = frontData;

        // - put the used index value in to track it.
        assertTransferIndexValue(indexValues, clientData.indexValues,
                                 queryHandle.index, queryHandle.indexParam);

        // - find the splice point
        var insertIdx = bsearchForInsert(queryHandle.items, clientData,
                                         queryHandle.cmpFunc);

        // - generate a splice
        queryHandle.splices.push(
          { index: insertIdx, howMany: 0, items: [localName]});
        queryHandle.items.splice(insertIdx, 0, clientData);

        this._log.nsItemAdded(queryHandle.uniqueId, fullName,
                              clientData.count, insertIdx, queryHandle.pending);

        if (queryHandle.pending === PENDING_NONE) {
          // some namespaces are immediately dispatched, others are not
          if (IMMED_NAMESPACES.indexOf(namespace) === -1) {
            queryHandle.pending = PENDING_NOTIF;
            querySource.pending.push(queryHandle);
          }
          else {
            this.sendQueryResults(queryHandle);
          }
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
   *
   * XXX we need to provide a rep generation callback like `namespaceItemAdded`
   *  has for the cases where a transition in object state can change its
   *  query visibility.
   *
   * @args[
   *   @param[namespace]
   *   @param[fullName]
   *   @param[baseCells]
   *   @param[mutatedCells]
   *   @param[indexValuesUpdate]
   *   @param[clientDataPopulater Function]{
   *     The same as in `namespaceItemAdded`, a callback that mutates the
   *     passed-in clientData instance to have a backside representation and
   *     returns the frontside representation.
   *   }
   *   @param[deltaPopulater Function]{
   *     Similar to the full client data populater, this function is responsible
   *     for idempotently mutating any existing clientData backside
   *     representation, but instead returns a frontside delta representation
   *     instead of a full frontside representation.
   *   }
   *   @param[indexPopulater Function]{
   *     XXX Speculative at this point function to help regenerate indices that
   *     the query wants but were not provided in the modification.  For
   *     example, if you 'pin' a contact so that it now applies to a query on
   *     the set of pinned peeps, there is no actual delta on the index values
   *     for the peep as a result of this.  Unfortunately, in that case, the
   *     data on the peep is currently insufficient to regenerate the indices
   *     without a database query, so it remains to be seen as to whether we
   *     should handle this.  (This is getting left it because I mistakenly
   *     added it for another case where it was relevant.)
   *   }
   * ]
   */
  namespaceItemModified: function(namespace, fullName,
                                  baseCells, mutatedCells, indexValuesUpdated,
                                  clientDataPopulater, deltaPopulater,
                                  indexPopulater
                                  ) {

    for (var qsKey in this._activeQuerySources) {
      var querySource = this._activeQuerySources[qsKey];
      // --- primary updates
      var queryHandles = querySource.queryHandlesByNS[namespace], iQuery,
          queryHandle;

      var clientData = null, frontData = null, localName = null,
          frontDataDelta = undefined, updatedIndices = false;

      for (iQuery = 0; iQuery < queryHandles.length; iQuery++) {
        queryHandle = queryHandles[iQuery];
        var anyChanges = false;

        var prePresent =
          queryHandle.membersByFull[namespace].hasOwnProperty(fullName);
        // -- newly matching query
        if (!prePresent) {
          // bail out if we lack the cells to perform a test, or if the query
          //  doesn't match.
          if (!baseCells ||
              !queryHandle.testFunc(baseCells, mutatedCells, fullName))
            continue;
          // we need to regenerate the indices if possible, since our update
          //  with the delta here may not contain the required indices for
          //  this new query
          if (!updatedIndices && indexPopulater) {
            indexValuesUpdated = indexValuesUpdated.concat(indexPopulater());
            updatedIndices = true;
          }
          // try and reuse an existing clientData rep if possible
          if (!clientData)
            clientData = this.reuseIfAlreadyKnown(queryHandle, namespace,
                                                  fullName);
          if (!clientData) {
            localName = "" + (querySource.nextUniqueIdAlloc++);
            clientData = {
              localName: localName,
              fullName: fullName,
              count: 1,
              // gets filled in by clientDataPopulater
              data: null,
              // starts out empty; we push indices in that are actually used
              indexValues: [],
              deps: [],
            };
            frontData = clientDataPopulater(clientData, queryHandle, fullName);

            queryHandle.membersByLocal[namespace][localName] = clientData;
            queryHandle.membersByFull[namespace][fullName] = clientData;
          }
          else {
            localName = clientData.localName;
            if (!frontData) {
              frontData = clientDataPopulater(clientData, queryHandle,
                                              fullName);
            }
          }

          queryHandle.dataMap[namespace][localName] = frontData;
          anyChanges = 'full';
        }
        // -- item already present in query result
        else {
          if (!clientData)
            clientData = queryHandle.membersByFull[namespace][fullName];
          localName = clientData.localName;

          // generate the delta rep if required.
          if (deltaPopulater) {
            if (frontDataDelta === undefined) {
              // try and grab an existing delta (possibly from a previous round)
              //  so we don't clobber previous but yet unsent deltas.
              if (queryHandle.dataDelta[namespace].hasOwnProperty(localName))
                frontDataDelta = queryHandle.dataDelta[namespace][localName];
              else
                frontDataDelta = {};
              deltaPopulater(clientData, queryHandle, frontDataDelta, fullName);
            }

            if (frontDataDelta !== null) {
              queryHandle.dataDelta[namespace][localName] = frontDataDelta;
              anyChanges = 'delta';
            }
          }
        }

        if (indexValuesUpdated && indexValuesUpdated.length) {
          if (transferIndexValue(indexValuesUpdated, clientData.indexValues,
                                 queryHandle.index, queryHandle.indexParam)) {
            // - check for and possibly generate splices to perform a move.
            // find the current index, remove it.
            var preIdx = queryHandle.items.indexOf(clientData);
            if (preIdx !== -1)
              queryHandle.items.splice(preIdx, 1);

            // find the insertion point using our updated index value, insert
            var insertIdx = bsearchForInsert(queryHandle.items, clientData,
                                             queryHandle.cmpFunc);
            queryHandle.items.splice(insertIdx, 0, clientData);

            // generate two splices if there was a move and flag a change
            if (preIdx !== insertIdx) {
              if (preIdx !== -1)
                queryHandle.splices.push(
                  { index: preIdx, howMany: 1, items: null });
              queryHandle.splices.push(
                { index: insertIdx, howMany: 0, items: [clientData.localName]});
              if (anyChanges)
                anyChanges += '-index';
              else
                anyChanges = 'index';
            }
          }
        }

        if (anyChanges) {
          this._log.nsItemModified(queryHandle.uniqueId, fullName, anyChanges);

          // some namespaces are immediately dispatched, others are not
          if (queryHandle.pending === PENDING_NONE) {
            if (IMMED_NAMESPACES.indexOf(namespace) === -1) {
              queryHandle.pending = PENDING_NOTIF;
              querySource.pending.push(queryHandle);
            }
            else {
              this.sendQueryResults(queryHandle);
            }
          }
        }
      }

      // --- dependent item updates
      // All the above handled updates relating to direct queries over items.
      // We are now concerned about making sure queries that have references
      //  to our item due to a reference/dependency hear about the update,
      //  so let's check the namespaces that can reference our namespace.

      // no point trying to do this if we can't generate deltas.
      if (!deltaPopulater)
        continue;
      for (var iDepNS = 0; iDepNS < DEP_HAVING_NAMESPACES.length; iDepNS++) {
        var depNS = DEP_HAVING_NAMESPACES[iDepNS];
        if (depNS === namespace)
          continue;

        queryHandles = querySource.queryHandlesByNS[depNS];
        for (iQuery = 0; iQuery < queryHandles.length; iQuery++) {
          queryHandle = queryHandles[iQuery];

          // bail if not present
          if (!queryHandle.membersByFull[namespace].hasOwnProperty(fullName))
            continue;
          clientData = queryHandle.membersByFull[namespace][fullName];
          localName = clientData.localName;

          // generate delta rep if not previously generated
          if (frontDataDelta === undefined) {
            // XXX duped logic from above
            if (queryHandle.dataDelta[namespace].hasOwnProperty(localName))
              frontDataDelta = queryHandle.dataDelta[namespace][localName];
            else
              frontDataDelta = {};
            deltaPopulater(clientData, queryHandle, frontDataDelta, fullName);
          }
          if (frontDataDelta !== null) {
            queryHandle.dataDelta[namespace][localName] = frontDataDelta;

            this._log.nsItemModified(queryHandle.uniqueId, fullName, 'dep');

            if (queryHandle.pending === PENDING_NONE) {
              // (dependent item namespaces are currently never immediate)
              queryHandle.pending = PENDING_NOTIF;
              querySource.pending.push(queryHandle);
            }
          }
        }
      }
    }
  },

  /**
   * Something known to us has been deleted from the system or otherwise should
   *  now be treated as completely unknown to us.
   */
  namespaceItemDeleted: function(namespace, name, item) {
  },

  //////////////////////////////////////////////////////////////////////////////
};

var LOGFAB = exports.LOGFAB = $log.register($module, {
  notificationKing: {
    events: {
      nsItemAdded: {queryId: true, fullName: true},
      nsItemModified: {queryId: true, fullName: true},
      sendQueryResults: {queryId: true},
    },
    TEST_ONLY_events: {
      nsItemAdded: {clientDataCount: false, spliceIndex: false,
                    prePending: false},
      nsItemModified: {changeType: false},
      sendQueryResults: {msg: false},
    },
    errors: {
      badQuery: {uniqueId: true, msg: false},
      errorDuringReleaseNotifications: {err: $log.EXCEPTION},
    },
    asyncJobs: {
      queryFill: {namespace: true, uniqueId: true},
    },
  },
});

}); // end define
