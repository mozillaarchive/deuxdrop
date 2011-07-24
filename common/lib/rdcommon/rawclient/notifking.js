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
 *   @key[queryHandlesByNS QueryHandlesByNS]
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
 *   @param[members]
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
 *   @param[dataDelta @dictof[
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
 *   ]]
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
    'exports'
  ],
  function(
    exports
  ) {

const NS_PEEPS = exports.NS_PEEPS = 'peeps',
      NS_CONVBLURBS = exports.NS_CONVBLURBS = 'convblurbs',
      NS_CONVALL = exports.NS_CONVALL = 'convall';

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
 * - No reference counting is used; the data is kept alive by the assumption
 *    that the user-facing thread is still alive and would have told us prior
 *    to going away.  Some type of heartbeat mechanism might be an appropriate
 *    sanity-checking backstop.  (In unit tests we would manually cause
 *    heartbeats and heartbeat checks to occur.)
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
function NotificationKing(store) {
  this._newishMessagesByConvId = {};
  this._store = store;

  this._highPrefixNum = 0;

  // sources and their queries
  this._activeQuerySources = {};
}
exports.NotificationKing = NotificationKing;
NotificationKing.prototype = {
  //////////////////////////////////////////////////////////////////////////////
  // Queries from Moda / Elsewhere

  /**
   * Register a new thing that will issue queries and wants notifications,
   *  returning a unique identifier prefix that must be used for all queries
   *  registered in the future.
   */
  registerNewQuerySource: function(verboseUniqueName, listener) {
    var prefixNum, prefixId;
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
    this._activeQuerySources[prefixId] = {
      name: verboseUniqueName,
      listener: listener,
      prefix: prefixId,
      queryHandlesByNS: makeEmptyListsByNS(),
    };
    return prefixId;
  },

  /**
   * Report that a previously registered query source is dead and all of its
   *  tracked queries should be killed.
   */
  unregisterQuerySource: function(verboseUniqueName) {
  },

  /**
   * Register a new query that is being issued and wants to hear about changes
   *  to its results (once received) and any new valid results once the results
   *  have been received.
   *
   * @return[QueryHandle]
   */
  newTrackedQuery: function(querySource, uniqueId, namespace, queryDef) {
    var queryHandle = {
      owner: querySource,
      uniqueId: uniqueId,
      namespace: namespace,
      queryDef: queryDef,
      members: makeEmptyMapsByNS(),
      // - data yet required (from dependencies)
      dataNeeded: makeEmptyListsByNS(),
      // - data to send over the wire once this round is done
      splices: [],
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
  // Cache checks

  checkIfIdAlreadyKnown: function(querySource, namespace, fullId) {
    var queryHandles = qsHandle.queryHandlesByNS[namespace];
    for (var iQuery = 0; iQuery < queryHandles.length; iQuery++) {
      var queryHandle = queryHandles[iQuery];
      var nsMembers = queryHandle.members[namespace];
      if (nsMembers.hasOwnProperty(fullId)) {
        return nsMembers[fullId];
      }
    }
    return null;
  },

  //////////////////////////////////////////////////////////////////////////////
  // Message Notifications from LocalStore
  //
  // Specialized message notification handling; required because the aggregation
  //  of messages into conversations is unique within our system.

  /**
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
    for (var qsKey in this._activeQuerySources) {
      var querySource = this._activeQuerySources[qsKey];
      var queryHandles = querySource.queryHandlesByNS[namespace];

      for (var iQuery = 0; iQuery < queryHandles.length; iQuery++) {

      }
    }
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
   */
  namespaceItemAdded: function(namespace, name, baseCells, mutatedCells) {
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
                                  baseCells, mutatedCells) {

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

}); // end define
