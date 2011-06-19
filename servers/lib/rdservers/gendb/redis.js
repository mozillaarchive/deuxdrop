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
 * (Remote) redis client.
 *
 * General data view mappings:
 * - Mailstore for users
 *   - User address book (peeps): [all, pinned] x [alphabetical, recency] of
 *      hash
 *   - Conversations: [all, by peep, pinned] x [recency] of hash+list
 *   - (Messages in conversations): [all, sent, received, in pinned] x [time] of
 *      some combo of blob/reference/metahash.
 * - Mailstore per-client stuff for users:
 *   - subscription: big blob? or big blob for major coverage plus lexicographic
 *      one-offs that should ideally cache well?
 * - Fanout server, per account
 *   - Live conversations:  [all live] x [conv id] of hash+list.
 **/

define(
  [
    'redis',
    'exports'
  ],
  function(
    $redis,
    exports
  ) {

function RedisDbConn(connInfo, nsprefix) {
  this._conn = $redis.createClient(connInfo.port, connInfo.host);
  if (connInfo.password)
    this._conn.auth(connInfo.password);

  this._prefix = nsprefix;
}
RedisDbConn.prototype = {
  //////////////////////////////////////////////////////////////////////////////
  // Hbase model
  //
  // Table/region/row/column family/column data-model where column families for
  //  a region cluster together with lexicographically ordered rows.  The level
  //  of atomicity is a single row.
  //
  // This should be used when:
  // - We believe we can generate long-term lexicographic clustering (things
  //    will be clustered on disk when fully merged) and/or temporal
  //    lexicographic clustering (things will be clustered in intermediary
  //    generations, including the memstore, because of write/read access
  //    patterns; this implies that we won't have to scan through all
  //    generations because of a bloom check/what not).
  // - We will not create undesirable disk hot-spotting.  Specifically, we want
  //    to avoid clustering seeks onto a spindle.  It's better to use a DHT
  //    model if we expect a request to result in a large number of seeks.

  defineHbaseTable: function(tableName, columnFamilies) {
  },

  getRow: function(tableName, rowId, columns) {
  },

  putCells: function(tableName, rowId, cells) {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Reorderable collection index model
  //
  // Support manually-updated ordered indices that name reference object
  //  identities (probably rows in the hbase model).  Semantics currently
  //  exactly correspond to the redis sorted set model, although there are ways
  //  to reflect this into hbase that will need analysis.  (We will likely use
  //  a naive stopgap for hbase initially.)

  defineReorderableIndex: function(tableName) {
  },
  /**
   * Scan index using the (ordered) values as our keypoints; although redis
   *  supports actual offsets, any hbase implementation would have serious
   *  difficulty with that model.  Because there could be multiple object
   *  names associated with a given value, object names can be provided to
   *  provide precise boundaries.  Passing null for a value tells us to use
   *  the relevant infinity.  Passing null for an object name means to use the
   *  relevant first/last value.
   */
  scanIndex: function(tableName, indexName,
                      lowValue, lowObjectName, lowInclusive,
                      highValue, highObjectName, highInclusive) {
  },

  /**
   * Update the value associated with an objectName for the given index for the
   *  given (index) table.
   */
  updateIndexValue: function(tableName, indexName, objectName, newValue,
                             oldValueIfKnown) {
    this._conn.zadd(this._prefix + '_' + tableName + '_' + indexName,
                    value, objectName);
  },
};
exports.DbConn = RedisDbConn;

}); // end define
