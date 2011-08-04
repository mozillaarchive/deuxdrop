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
 * IndexedDB implementation of our database abstraction.  For now, all the
 *  generic documentation lives on the `redis.js` implementation.  Specifics
 *  about the IndexedDB mapping do live in here.
 **/

define(
  [
    'q',
    './logdef',
    'module',
    'exports'
  ],
  function(
    $Q,
    $_logdef,
    $module,
    exports
  ) {
const when = $Q.when;

const LOGFAB = $_logdef.LOGFAB;

var IndexedDB = mozIndexedDB;

function IndexedDbConn(nsprefix, _logger) {
  this._db = null;
  this._tableToObjStore = {};
  this._tableIndices = {};

  this._log = LOGFAB.gendbConn(this, _logger, [nsprefix]);

  var dbOpenRequest = IndexedDB.open("deuxdrop-" + nsprefix);
  var self = this;
  dbOpenRequest.onerror = function(event) {
    self._log.dbErr(dbOpenRequest.errorCode);
  };
  dbOpenRequest.onsuccess = function(event) {
    self._db = dbOpenRequest.result;
  };


}
IndexedDbConn.prototype = {
  toString: function() {
    return '[IndexedDbConn]';
  },
  toJSON: function() {
    return {
      type: 'IndexedDbConn',
    };
  },

  /**
   *
   */
  defineSchema: function(schema) {
    this._tableToObjStore[tableName] = this._db.createObjectStore(tableName);
    var objStore = this._tableToObjStore[tableName];
    var dbIndex = objStore.createIndex(indexName);
    this._tableIndices[tableName + indexName] = dbIndex;

  },

  //////////////////////////////////////////////////////////////////////////////
  // Hbase model
  //
  // IndexedDB is a straight-up key/value store where the keys are
  //  lexicographically ordered keys (like in LevelDB).  We can map the hbase
  //  model onto the IndexedDB model by just concatenating the column names onto
  //  the row identifiers.  We then perform a scan to get all the cells in the
  //  row.
  // Column family-wise, we are pretending they don't exist, although we could
  //  implement them hbase-style by putting them in different object stores.
  //
  // It's worth debating whether we actually need to be storing the cells in
  //  separate key/value pairs rather than just cramming them into an object
  //  that we store in a single key/value pair.  The main argument in favor of
  //  the big blob is that it would avoid data being smeared across multiple
  //  log files at the expense of increased (highly localized) memory/disk
  //  traffic.
  // The hygienic argument against is that there is much greater risk for
  //  atomic replacement causing data to be lost.  The counterpoint is that
  //  we're already trying quite hard to ensure that all logic is serialized
  //  so that shouldn't be a notable risk.

  getRowCell: function(tableName, rowId, columnName) {
    var deferred = $Q.defer();
    this._log.getRowCell(tableName, rowId, columnName);
    this._conn.hget(this._prefix + ':' + tableName + ':' + rowId, columnName,
                     function(err, result) {
      if (err)
        deferred.reject(err);
      else
        deferred.resolve(unboxPersisted(result));
    });
    return deferred.promise;
  },

  boolcheckRowCell: function(tableName, rowId, columnName) {
    return when(this.getRowCell(tableName, rowId, columnName),
                Boolean
                // rejection pass-through is fine
               );
  },

  assertBoolcheckRowCell: function(tableName, rowId, columnName, exClass) {
    return when(this.getRowCell(tableName, rowId, columnName),
      function(val) {
        if (!val)
          throw new (exClass || Error)(columnName + " was falsy");
        return Boolean(val);
      }
      // rejection pass-through is fine
    );
  },

  getRow: function(tableName, rowId, columnFamilies) {
    var deferred = $Q.defer();
    this._log.getRow(tableName, rowId, columnFamilies);
    this._conn.hgetall(this._prefix + ':' + tableName + ':' + rowId,
                       function(err, result) {
      if (err) {
        deferred.reject(err);
      }
      else {
        var odict = {};
        for (var key in result) {
          odict[key] = unboxPersisted(result[key]);
        }
        deferred.resolve(odict);
      }
    });
    return deferred.promise;
  },

  putCells: function(tableName, rowId, cells) {
    var deferred = $Q.defer();
    var ocells = {};
    for (var key in cells) {
      ocells[key] = boxPersisted(cells[key]);
    }
    this._log.putCells(tableName, rowId, cells);
    this._conn.hmset(this._prefix + ':' + tableName + ':' + rowId, ocells,
                     function(err, replies) {
      if (err)
        deferred.reject(err);
      else
        deferred.resolve(null);
    });
    return deferred.promise;
  },

  deleteRow: function(tableName, rowId) {
    var deferred = $Q.defer();
    this._log.deleteRow(tableName, rowId);
    this._conn.del(this._prefix + ':' + tableName + ':' + rowId,
                     function(err, result) {
      if (err)
        deferred.reject(err);
      else
        deferred.resolve(result);
    });
    return deferred.promise;
  },

  deleteRowCell: function(tableName, rowId, columnName) {
    var deferred = $Q.defer();
    this._log.deleteRowCell(tableName, rowId, columnName);
    this._conn.hdel(this._prefix + ':' + tableName + ':' + rowId, columnName,
                     function(err, result) {
      if (err)
        deferred.reject(err);
      else
        deferred.resolve(result);
    });
    return deferred.promise;
  },

  incrementCell: function(tableName, rowId, columnName, delta) {
    var deferred = $Q.defer();
    this._log.incrementCell(tableName, rowId, columnName, delta);
    this._conn.hincrby(this._prefix + ':' + tableName + ':' + rowId,
                       columnName, delta, function(err, result) {
      if (err)
        deferred.reject(err);
      else
        deferred.resolve(result);
    });
    return deferred.promise;
  },

  raceCreateRow: function(tableName, rowId, probeCellName, cells) {
    var self = this;
    this._log.raceCreateRow(tableName, rowId, probeCellName, cells);
    return when(this.incrementCell(tableName, rowId, probeCellName, 1),
      function(valAfterIncr) {
        // - win
        if (valAfterIncr === 1) {
          return self.putCells(tableName, rowId, cells);
        }
        // - lose
        else {
          // XXX we should perhaps return a boolean as to whether we won to the
          //  caller and leave it up to them to generate a more appropriate
          //  exception, if any.
          throw new Error("lost race");
        }
      }
      // rejection pass-through is fine, although is ambiguous versus the above
    );
  },

  //////////////////////////////////////////////////////////////////////////////
  // Reorderable collection index model
  //
  // IndexedDB has built-in support for indices, but our semantics don't line
  //  up, so we don't use them.  Specifically:
  // - we are currently modeling cells as distinct key/value pairs, so index
  //    references won't line up correctly.
  // - some indices are only populated based on filters (ex: pinned)
  // - we may update indices without actually issuing a write against the things
  //   the indices are referencing.
  //
  // In terms of how to handle the "delete the old index value" case, there are
  //  broadly five strategies that can be used:
  // 1) Ordered keys, require the caller to always know the old value so we can
  //    issue a delete.  This is potentially annoying to calling code.
  // 2) Ordered keys, issue a read request to another location if the old value
  //    is not provided/known to find the old value for deletion purposes.
  // 3) Ordered keys, blind writes with 'scan deletion' nuking the old value.
  //    This would be assuming the cost of the scan is cheaper than the cost of
  //    the random I/O.
  // 4) Ordered keys, blindly issue writes that include metadata so that on
  //    reads we can perform a 'compaction' pass where we notice out-of-date
  //    values and ignore and possibly issue deletes against the moot values.
  //    This is only viable at large-scale if we assume that values only can
  //    migrate towards the 'front' and that we always start our scans from the
  //    'front' moving towards the back so our mooting algorithm always makes
  //    the correct choice.  (Whereas if we seek to the middle we might see
  //    a mooted value and not know it is mooted.)  A mechanism by which the
  //    'dirtiness' of indices could be tracked might be helpful, but unlikely
  //    to pay for itself.
  // 5) "Amortized dirty bucket" that overflows to ordered keys.  Whenever we
  //    issue an index change, we issue it directly into the "dirty bucket".
  //    In the simple case where the index is small, we only ever load the
  //    contents of the dirty bucket and we just perform an in-memory sort and
  //    use that.  When the bucket gets too large, we do the sort again but
  //    now persist all of the keys beyond a certain value horizon into an
  //    ordered keyspace and make note of that in the dirty bucket.  Whenever
  //    we have a query that just wants "recent" data, we can just grab it
  //    from the dirty bucket.  When we have a query that wants "older" data,
  //    it grabs the contents of the dirty bucket and issues a value range
  //    query against the ordered older data, then apply any changes from the
  //    dirty bucket to the ordered data.
  //
  // We are currently implementing a variant on #5, "infinitely big unordered
  //  bucket" with the expectation that the overflow case is a good idea and
  //  we will eventually get around to it.  Ideally we will also do a literature
  //  search and figure out what the name for that general strategy is and
  //  if there are any fundamental issues with impementing it on top of a
  //  log-structured-merge datastore.

  scanIndex: function(tableName, indexName, indexParam,
                      lowValue, lowObjectName, lowInclusive,
                      highValue, highObjectName, highInclusive) {
    var deferred = $Q.defer();
    var minValStr = (lowValue == null) ? '-inf' : lowValue,
        maxValStr = (highValue == null) ? '+inf' : highValue;
    this._log.scanIndex(tableName, indexName, indexParam, maxValStr, minValStr);
    this._conn.zrevrangebyscore(
        this._prefix + ':' + tableName + ':' + indexName + ':' + indexParam,
        maxValStr, minValStr, 'WITHSCORES', function(err, results) {
      if (err)
        deferred.reject(err);
      else
        deferred.resolve(results);
    });
    return deferred.promise;
  },

  /**
   * Add/update the numeric value associated with an objectName for the given
   *  index for the given (index) table.
   */
  updateIndexValue: function(tableName, indexName, indexParam,
                             objectName, newValue) {
    var deferred = $Q.defer();
    this._log.updateIndexValue(tableName, indexName, indexParam,
                               objectName, newValue);
    this._conn.zadd(
      this._prefix + ':' + tableName + ':' + indexName + ':' + indexParam,
      newValue, objectName, function(err, result) {
        if (err)
          deferred.reject(err);
        else
          deferred.resolve(result);
      });
    return deferred.promise;
  },

  /**
   * Set the numeric value associated with an objectName for the given index to
   *  the maximum of its current value and the value we are providing.
   *
   * XXX COPOUT! this does not actually maximize! this just updates!
   */
  maximizeIndexValue: function(tableName, indexName, indexParam,
                               objectName, newValue) {
    var deferred = $Q.defer();
    this._log.maximizeIndexValue(tableName, indexName, indexParam,
                                 objectName, newValue);
    this._conn.zadd(
      this._prefix + ':' + tableName + ':' + indexName + ':' + indexParam,
      newValue, objectName, function(err, result) {
        if (err)
          deferred.reject(err);
        else
          deferred.resolve(result);
      });
    return deferred.promise;
  },
  //////////////////////////////////////////////////////////////////////////////
};

}); // end define
