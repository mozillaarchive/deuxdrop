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
    'q',
    'redis',
    'rdcommon/gendb-logdef',
    'module',
    'exports'
  ],
  function(
    $Q,
    $redis,
    $_logdef,
    $module,
    exports
  ) {
const when = $Q.when;

const LOGFAB = exports.LOGFAB = $_logdef.LOGFAB;

function boxPersisted(val) {
  switch (typeof(val)) {
    case "object":
      return JSON.stringify(val);
    case "string":
      return "S" + val;
    default:
      return val;
  }
}
function unboxPersisted(val) {
  if (val == null)
    return null;
  switch (val[0]) {
    case '{':
      return JSON.parse(val);
    case 'S':
      return val.substring(1);
    default:
      return parseInt(val);
  }
}

function RedisDbConn(connInfo, nsprefix, _logger, dbNum) {
  this._conn = $redis.createClient(connInfo.port, connInfo.host);
  if (connInfo.password)
    this._conn.auth(connInfo.password);

  this._conn.on('ready', this._onReady.bind(this));
  this._conn.on('error', this._onError.bind(this));
  this._conn.on('end', this._onClosed.bind(this));

  this._conn.select(dbNum);

  this._log = LOGFAB.gendbConn(this, _logger, [nsprefix]);

  this._dbNum = dbNum;

  this._prefix = nsprefix;
}
RedisDbConn.prototype = {
  toString: function() {
    return '[RedisDbConn]';
  },
  toJSON: function() {
    return {
      type: 'RedisDbConn',
    };
  },

  _onReady: function() {
    this._log.connected();
    this._conn.select(this._dbNum);
  },
  _onError: function(err) {
    this._log.dbErr(err);
    this._conn.select(this._dbNum);
  },
  _onClosed: function() {
    this._log.closed();
    this._conn.select(this._dbNum);
  },

  defineSchema: function(schema) {
    // no schema for redis stuffs, yo.
  },

  //////////////////////////////////////////////////////////////////////////////
  // Hbase model
  //
  // Table/region/row/column family/column data-model where column families for
  //  a region cluster together with lexicographically ordered rows.  The level
  //  of atomicity is a single row.
  //
  // All cells get type-boxed to make debug logging easier/prettier.
  //  Specifically, if you give us an object, we will stringify it on its way
  //  to the database and parse it on its way out.  In order to avoid ambiguity
  //  we prefix strings with "S" on their way in.  This leaves us able to
  //  distinguish types based on the first character: '{' is a JSONed object,
  //  'S' is a string, everything else must be a number that we parseInt.
  //  See `boxPersisted`/`unboxPersisted`.
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

  /**
   * Get the cell and return a truthy value based on the cell value.
   */
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

  /**
   * Increment the numeric value in a cell.  Keep in mind that in hbase this
   *  will require a read followed by a write which means this should likely
   *  only be used for rows that store very little in them and are likely to
   *  be cached or have extremely limited turnover.
   *
   * XXX Although hbase can do increments, I'm not sure stargate exposes it,
   *  so this might not be totally do-able in an efficient fashion.
   *
   * @return[Number]{
   *   The value after incrementing.  We might need to change this depending
   *   on hbase.
   * }
   */
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

  /**
   * Create a row only if it does not exist.  If it does exist, issue a
   *  rejection.  The mechanism by which this operates is implementation
   *  dependent; to help out implementations that don't make this super easy,
   *  you must provide the name of a probe cell that we can use to perform
   *  an increment on and that we will leave around as long as the row exists.
   *
   * The assumption is that it is very likely that we will win this race, but
   *  for correctness/security reasons, it is vital that we not just naively
   *  assume a race/collision is impossible.
   */
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

  /**
   * XXX unacceptable performance characteristics on redis, non-conformant
   *  as it relates to hbase semantics... all kinds of issues.
   *
   * XXX this only exists for `fakefakeserver.js` which is not yet a thing and
   *  probably may not end up being a thing.  This should ideally just get
   *  removed.
   */
  XXX_scanTableBatch_rowNames: function(tableName) {
    var deferred = $Q.defer();
    var prefixBase = this._prefix + ':' + tableName + ':';
    this._conn.keys(prefixBase + '*',
                    function(err, keynames) {
      if (err) {
        deferred.reject(err);
        return;
      }
      var rowNames = [], offset = prefixBase.length;
      for (var i = 0; i < keynames.length; i++) {
        rowNames.push(keynames[i].substring(offset));
      }
      deferred.resolve(rowNames);
    });
    return deferred.promise;
  },

  //////////////////////////////////////////////////////////////////////////////
  // Reorderable collection index model
  //
  // Support manually-updated ordered indices that name reference object
  //  identities (probably rows in the hbase model).  Semantics currently
  //  exactly correspond to the redis sorted set model, although there are ways
  //  to reflect this into hbase that will need analysis.  (We will likely use
  //  a naive stopgap for hbase initially.)

  /**
   * Very temporary scanning mechanism that will need to be revisted a few
   *  times.  The competing factors are a desire to implement something that's
   *  efficient in hbase while dealing with locality.  For the time being
   *  our model is that there is no locality between the index and the actual
   *  data storage so there is no harm in treating the actual row fetches as
   *  separate operations using the usual primitives.  This has the actual
   *  benefit of allowing the caching layer a chance to skip already known
   *  rows.  (On the server, this would more likely manifest as an assisted
   *  query where a 'cache hit' is talking about a row the client already
   *  knows about/is subscribed to and so does not require a fetch, while a
   *  'cache miss' is something we need to send down the wire and thus
   *  most likely must fetch from the db layer since we are not likely to
   *  otherwise have the data around.)
   *
   * Scan index using the (ordered) values as our keypoints; although redis
   *  supports actual offsets, any hbase implementation would have serious
   *  difficulty with that model.  Because there could be multiple object
   *  names associated with a given value, object names can be provided to
   *  provide precise boundaries.  Passing null for a value tells us to use
   *  the relevant infinity.  Passing null for an object name means to use the
   *  relevant first/last value.
   *
   * Scanning currently is hard-coded to assume high to low because we are
   *  presuming timestamp use for everything.
   *
   */
  scanIndex: function(tableName, indexName, indexParam, desiredDir,
                      lowValue, lowObjectName, lowInclusive,
                      highValue, highObjectName, highInclusive) {
    // XXX actually use the range support
    var deferred = $Q.defer();
    var minValStr = (lowValue == null) ? '-inf' : lowValue,
        maxValStr = (highValue == null) ? '+inf' : highValue;
    this._log.scanIndex(tableName, indexName, indexParam, maxValStr, minValStr);
    var keyName =
      this._prefix + ':' + tableName + ':' + indexName + ':' + indexParam;
    this._conn[(desiredDir === -1) ? 'zrevrangebyscore' : 'zrangebyscore'](
        keyName,
        (desiredDir === -1) ? maxValStr : minValStr,
        (desiredDir === -1) ? minValStr : maxValStr,
        'WITHSCORES', function(err, results) {
      if (err) {
        deferred.reject(err);
      }
      else {
        for (var i = 1; i < results.length; i += 2) {
          results[i] = parseInt(results[i]);
        }
        deferred.resolve(results);
      }
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
   * Update multiple indices in a single batch.
   *
   * @args[
   *   @param[tableName]{
   *     The name of the associated table we are performing updates on.
   *   }
   *   @param[updates IndexValues]
   * ]
   */
  updateMultipleIndexValues: function(tableName, updates) {
    var deferred = $Q.defer(),
        multi = this._conn.multi();
    for (var iUpdate = 0; iUpdate < updates.length; iUpdate++) {
      var update = updates[iUpdate],
          indexName = update[0], indexParam = update[1],
          objectName = update[2], newValue = update[3];
      this._log.updateIndexValue(tableName, indexName, indexParam,
                                 objectName, newValue);
      multi.zadd(
        this._prefix + ':' + tableName + ':' + indexName + ':' + indexParam,
        newValue, objectName);
    }
    multi.exec(function(err, replies) {
      if (err)
        deferred.reject(err);
      else
        deferred.resolve(updates);
    });
    return deferred.promise;
  },

  /**
   * Set the numeric value associated with an objectName for the given index to
   *  the maximum of its current value and the value we are providing.
   */
  maximizeIndexValue: function(tableName, indexName, indexParam,
                               objectName, newValue) {
    var deferred = $Q.defer(), self = this;
    this._log.maximizeIndexValue(tableName, indexName, indexParam,
                                 objectName, newValue);
    var keyName =
      this._prefix + ':' + tableName + ':' + indexName + ':' + indexParam;
    this._conn.zscore(keyName, objectName, function(err, result) {
      if (err) {
        deferred.reject(err);
        return;
      }
      // there may be no existing value
      if (result != null)
        newValue = Math.max(newValue, parseInt(result));
      self._conn.zadd(keyName, newValue, objectName, function(err, result) {
          if (err)
            deferred.reject(err);
          else
            deferred.resolve(result);
        });
    });
    return deferred.promise;
  },

  /**
   * Maximize multiple indices in a single batch.  Consumes `IndexValue`
   *  representations like `updateMultipleIndexValues` with the notable
   *  side-effect of updating the representation to be consistent with the
   *  database representation.  Specifically, if the value in the database
   *  is larger than the provided value, it is updated.
   */
  maximizeMultipleIndexValues: function(tableName, maxdates) {
    var deferred = $Q.defer(),
        multiGet = this._conn.multi(), multiSet = this._conn.multi(),
        keyNames = [];
    for (var iMaxdate = 0; iMaxdate < maxdates.length; iMaxdate++) {
      var maxdate = maxdates[iMaxdate],
          indexName = maxdate[0], indexParam = maxdate[1],
          objectName = maxdate[2], newValue = maxdate[3];
      this._log.maximizeIndexValue(tableName, indexName, indexParam,
                                   objectName, newValue);
      var keyName =
        this._prefix + ':' + tableName + ':' + indexName + ':' + indexParam;
      keyNames.push(keyName);
      multiGet.zscore(keyName, objectName);
    }
    multiGet.exec(function(err, replies) {
      if (err) {
        deferred.reject(err);
        return;
      }
      var updatesRequired = 0;
      for (var iMaxdate = 0; iMaxdate < maxdates.length; iMaxdate++) {
        var rawResult = replies[iMaxdate], maxdate = maxdates[iMaxdate], curVal;
        // we need to update the database if our new value is bigger/new
        if (rawResult == null ||
            (curVal = parseInt(rawResult)) < maxdate[3]) {
          updatesRequired++;
          multiSet.zadd(keyNames[iMaxdate], maxdate[3], maxdate[2]);
        }
        // we need to update the memory rep if the db is bigger
        else {
          maxdate[3] = curVal;
        }
      }
      if (updatesRequired) {
        multiSet.exec(function(setErr, setReplies) {
          if (setErr)
            deferred.reject(setErr);
          else
            deferred.resolve(maxdates);
        });
      }
      else {
        deferred.resolve(maxdates);
      }
    });
    return deferred.promise;
  },

  //////////////////////////////////////////////////////////////////////////////
  // String-Value Indices
  //
  // There's no great representation in redis for this.  We just use a hash and
  //  sort it when needed.

  updateStringIndexValue: function(tableName, indexName, indexParam,
                                   objectName, newValue) {
    var deferred = $Q.defer();
    this._log.updateIndexValue(tableName, indexName, indexParam,
                               objectName, newValue);
    this._conn.hset(
      this._prefix + ':' + tableName + ':' + indexName + ':' + indexParam,
      objectName, newValue, function(err, result) {
        if (err)
          deferred.reject(err);
        else
          deferred.resolve(result);
      });
    return deferred.promise;
  },

  scanStringIndex: function(tableName, indexName, indexParam, desiredDir) {
    const dir = desiredDir;
    var deferred = $Q.defer();
    this._log.scanIndex(tableName, indexName, indexParam);
    this._conn.hgetall(
        this._prefix + ':' + tableName + ':' + indexName + ':' + indexParam,
        function(err, results) {
      if (err) {
        deferred.reject(err);
      }
      else {
        var sortie = [];
        for (var key in results) {
          sortie.push({obj: key, val: results[key]});
        }
        sortie.sort(function(a, b) {
          return dir * a.val.localeCompare(b.val);
        });
        var listyResults = [];
        for (var i = 0; i < sortie.length; i++) {
          listyResults.push(sortie[i].obj);
          listyResults.push(sortie[i].val);
        }
        deferred.resolve(listyResults);
      }
    });
    return deferred.promise;
  },

  //////////////////////////////////////////////////////////////////////////////
  // Queue Abstraction

  queueAppend: function(tableName, queueName, values) {
    var multi = this._conn.multi();
    this._log.queueAppend(tableName, queueName, values);
    for (var i = 0; i < values.length; i++) {
      multi.rpush(this._prefix + ':' + tableName + ':' + queueName,
                  JSON.stringify(values[i]));
    }
    var deferred = $Q.defer();
    multi.exec(function(err, replies) {
      if (err)
        deferred.reject(err);
      else
        deferred.resolve(null);
    });
    return deferred.promise;
  },

  queuePeek: function(tableName, queueName, count) {
    var deferred = $Q.defer();
    this._log.queuePeek(tableName, queueName, count);
    this._conn.lrange(this._prefix + ':' + tableName + ':' + queueName,
                      0, count - 1, function(err, multibulk) {
      if (err)
        deferred.reject(err);
      else
        deferred.resolve(multibulk.map(JSON.parse));
    });
    return deferred.promise;
  },

  queueConsume: function(tableName, queueName, count) {
    var deferred = $Q.defer();
    this._log.queueConsume(tableName, queueName, count);
    this._conn.ltrim(this._prefix + ':' + tableName + ':' + queueName,
                     count, -1, function(err, status) {
      if (err)
        deferred.reject(err);
      else if (status === "OK")
        deferred.resolve();
      else
        deferred.reject(status);
    });
    return deferred.promise;
  },

  /**
   * Consume some number of queue entries, then immediately peek for some
   *  other number of queue entries.
   */
  queueConsumeAndPeek: function(tableName, queueName, consumeCount, peekCount) {
    var deferred = $Q.defer();
    var multi = this._conn.multi();
    this._log.queueConsumeAndPeek(tableName, queueName, consumeCount, peekCount);
    multi.ltrim(this._prefix + ':' + tableName + ':' + queueName,
                consumeCount, -1);
    multi.lrange(this._prefix + ':' + tableName + ':' + queueName,
                 0, peekCount - 1);
    multi.exec(function(err, replies) {
      if (err)
        deferred.reject(err);
      else
        deferred.resolve(replies[1].map(JSON.parse));
    });
    return deferred.promise;
  },

  //////////////////////////////////////////////////////////////////////////////
  // Session Management

  close: function() {
    this._conn.quit();
  },

  //////////////////////////////////////////////////////////////////////////////
};
exports.DbConn = RedisDbConn;

const TEST_DB_OFFSET = 16;

/**
 * Create a product database connection; we always use redis db #1.  An
 *  alternative would be to detect if `uniqueName` is an integer and then
 *  use that to tell us the database number to use instead of requiring a
 *  namespacing mechanism.
 */
exports.makeProductionDBConnection = function(uniqueName, host, port, _logger) {
  var conn = new RedisDbConn({host: host, port: port}, uniqueName,
                             _logger, 1);
  return conn;
};

/**
 * Nuke the contents of the given production database.
 *
 * @return[Promise]
 */
exports.nukeProductionDatabase = function(conn) {
  var deferred = $Q.defer();
  // no prefix we can just flush the database
  if (conn._prefix.length === 0) {
    conn._conn.flushdb(function(err) {
      if (err)
        deferred.reject(err);
      else
        deferred.resolve();
    });
  }
  // yes prefix, we need to use keys() and follow that up with a del()
  else {
    conn._conn.keys(function(err, keys) {
      if (err) {
        deferred.reject(err);
        return;
      }
      conn._conn.del.apply(conn._conn, keys, function(err) {
        if (err)
          deferred.reject(err);
        else
          deferred.resolve();
      });
    });
  }

  return deferred.promise;
};

exports.closeProductionDBConnection = function(conn) {
  conn.close();
};

/**
 * Create a test connection to a test database.
 *
 * XXX theory, not done due to resource fears, just using db 2 for now...
 * To ensure tests get their own
 *  little world to play in, we use the process pid as a uniqueifying
 *  constraint.  Callers are still required to provide a unique name to
 *  namespace this connection from other connections used by the same test but
 *  that want their own theoretical database.
 */
exports.makeTestDBConnection = function(uniqueName, _logger) {
  var conn = new RedisDbConn({host: '127.0.0.1', port: 6379}, uniqueName,
                             _logger, 2);
  conn._conn.flushdb();
  return conn;
};

exports.cleanupTestDBConnection = function(conn) {
  // We do not flush the database afterwards so that we can inspect it if we
  //  want.  (Which is why when the test connects it clears it.)
  // nb: This could have some performance misattribution issues if we don't
  //  specially treat (at least some) 'setup' nodes so they don't count.
  conn.close();
};

}); // end define
