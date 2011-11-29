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
 * Common logging definition for our database abstraction implementations.
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

const DICE_TABLE = 'db:table', DICE_INDEX = 'db:index', DICE_QUEUE = 'db:queue';
var LOGFAB = exports.LOGFAB = $log.register($module, {
  gendbConn: {
    type: $log.DATABASE,
    subtype: $log.CLIENT,

    dicing: {
      name: 'Databases',
      binGroups: {
        'Tables': DICE_TABLE,
        'Indices': DICE_INDEX,
        'Queues': DICE_QUEUE,
      },
      attributes: {
        read: {
          nameMatch: "get|scan|Peek",
        },
        write: {
          nameMatch:
            "put|increment|Create|delete|update|maximize|Append|Consume",
        },
      },
    },

    events: {
      connecting: {},
      connected: {},
      closed: {},

      // - hbase abstractions
      getRowCell: {tableName: DICE_TABLE, rowId: true, columnName: true},
      getRow: {tableName: DICE_TABLE, rowId: true, columnFamilies: false},
      putCells: {tableName: DICE_TABLE, rowId: true},
      incrementCell: {tableName: DICE_TABLE, rowId: true, columnName: true,
                      delta: true},
      raceCreateRow: {tableName: DICE_TABLE, rowId: true},

      deleteRowCell: {tableName: DICE_TABLE, rowId: true, columnName: true},
      deleteRow: {tableName: DICE_TABLE, rowId: true},

      // - reorderable collection abstraction
      updateIndexValue: {tableName: DICE_INDEX, indexName: DICE_INDEX,
                         indexParam: DICE_INDEX,
                         objectName: true, newValue: false},
      maximizeIndexValue: {tableName: DICE_INDEX, indexName: DICE_INDEX,
                           indexParam: DICE_INDEX,
                           objectName: true, newValue: false},
      deleteIndexValue: {tableName: DICE_INDEX, indexName: DICE_INDEX,
                         indexParam: DICE_INDEX, objectName: true},

      scanIndex: {tableName: DICE_INDEX, indexName: DICE_INDEX,
                  indexParam: DICE_INDEX,
                  maxVal: false, minVal: true},

      // - queue abstraction
      queueAppend: {tableName: DICE_QUEUE, queueName: DICE_QUEUE},
      queuePeek: {tableName: DICE_QUEUE, queueName: DICE_QUEUE, count: false},
      queueConsume: {tableName: DICE_QUEUE, queueName: DICE_QUEUE,
                     count: false},
      queueConsumeAndPeek: {tableName: DICE_QUEUE, queueName: DICE_QUEUE,
                            consumeCount: false, peekCount: false},
    },
    TEST_ONLY_events: {
      putCells: {cells: $log.JSONABLE},
      raceCreateRow: {probeCellName: false, cells: $log.JSONABLE},

      queueAppend: {values: false},
    },
    errors: {
      dbErr: {err: $log.EXCEPTION},
    },
    LAYER_MAPPING: {
      layer: "db",
    },
  },
});

}); // end define
