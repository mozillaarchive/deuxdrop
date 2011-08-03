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
 * Verify the viewslice logic nuances of the `NotificationKing`.  Specifically:
 * - Proper insertion of new records by index value.
 * - Proper removal of deleted records.
 * - Proper net movement of records when indexed values (ex: display name,
 *    the appropriate timestamp) are updated.
 * - Proper insertion of records now matching a query.
 * - Proper removal of records no longer matching a query.
 *
 * Future work that is not currently dealt with:
 * - Everything involved with subset/bounded view slices.
 *
 * This logic is all tested by generating synthetic events at a
 *  NotificationKing; nothing ever hits the database.  We use the real domain
 *  models rather than introducing synthetic data types.
 **/

define(
  [
    'assert',
    'q',
    'rdcommon/log',
    'rdcommon/testcontext',
    'rdcommon/rawclient/notifking',
    'rdcommon/moda/testhelper',
    'module',
    'exports'
  ],
  function(
    assert,
    $Q,
    $log,
    $tc,
    $notifking,
    $th_moda,
    $module,
    exports
  ) {

var LOGFAB = exports.LOGFAB = $log.register($module, {
  testQuerySource: {
    events: {
      delta: {
        delta: $log.STATEDELTA,
      },
    },
    errors: {
      noSuchQuery: {uniqueName: true},
    }
  },
});

var TD = exports.TD = $tc.defineTestsFor($module, LOGFAB, null,
                                         ['client:db']);

/**
 * Testing stand-in for the `ModaBackside` that generates test events where
 *  the `ModaBackside` would be sending a message over the wire.
 */
function TestQuerySource(name) {
  this.king = new $notifking.NotificationKing(null);
  this.log = LOGFAB.testQuerySource();

  this._source = this.king.registerNewQuerySource(name, this);

  this._nextId = 0;
  this._queries = {};
}
TestQuerySource.prototype = {
  //////////////////////////////////////////////////////////////////////////////
  // Test Event Generation

  /**
   * Tell the `NotificationKing` about a new (peeps) query.
   */
  createQuery: function(query) {
    var id = this._nextId++;
    var queryInfo = this._queries[id] = {
      handle: this.king.newTrackedQuery(this._source, id,
                                        $notifking.NS_PEEPS, query),
      items: [],
    };
    return queryInfo;
  },

  /**
   * Generate item notifications at the `NotificationKing` and producing actor
   *  expectations as a byproduct.
   */
  synthAddition: function() {
  },

  synthModification: function() {
  },

  synthRemoval: function() {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Process Notifications from the NotificationKing, log.

  receiveQueryUpdate: function(msg) {
    if (!this._queries.hasOwnProperty(msg.uniqueId)) {
      this.log.noSuchQuery(msg.uniqueId);
    }
    var queryInfo = this._queries[msg.uniqueId];

    var preAnno = {}, state = {}, postAnno = {};

    var items = queryInfo.items;
    for (var iSplice = 0; iSplice < msg.splices.length; iSplice++) {
      var splice = msg.splices[iSplice];
      // mark the removals in preAnno
      markListIntoObj(items.slice(splice.index, splice.index + splice.howMany),
                      preAnno, -1);
      // mark the additions in postlAnno
    }

    // build a full

    this.log.delta({
      preAnno: preAnno,
      state: state,
      postAnno: postAnno,
    });
  },

  //////////////////////////////////////////////////////////////////////////////
};

TD.commonCase('new record', function(T) {
  var eQS = T.actor('testQuerySource', 't');
  var qs;

  T.action(eQS, 'initial empty query', function() {
    qs = new TestQuerySource("t");

  });

  T.action(eQS, 'add first record', function() {
    eQS.expect_deltaAndResult({
      preAnno: {},
      state: {},
      postAnno: {},
    });
  });

  T.action(eQS, 'add record before', function() {
  });

  T.action(eQS, 'add record in-between', function() {
  });

  T.action(eQS, 'add record after', function() {
  });
});

TD.commonCase('deleted record', function(T) {
  var eQS = T.actor('testQuerySource', 't');
  var qs;

  T.action(eQS, 'initial query with 4 records', function() {
    qs = new TestQuerySource();
  });

  T.action(eQS, 'delete a middle record', function() {
  });

  T.action(eQS, 'delete first record', function() {
  });

  T.action(eQS, 'delete last record', function() {
  });
});

TD.commonCase('record movement', function(T) {
});

TD.commonCase('record now matches', function(T) {
});

TD.commonCase('record no longer matches', function(T) {
});

TD.commonCase('reuse of cached data', function(T) {
});

TD.commonCase('multiple concurrent queries', function(T) {
});


}); // end define
