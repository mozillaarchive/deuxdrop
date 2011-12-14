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
 * Unit tests for simple algorithms that are easy to screw up.
 **/

define(
  [
    'rdcommon/log',
    'rdcommon/testcontext',
    'rdcommon/rawclient/notifking',
    'module',
    'exports'
  ],
  function(
    $log,
    $tc,
    $notifking,
    $module,
    exports
  ) {

var TD = exports.TD = $tc.defineTestsFor($module, null, null,
                                         ['util:algorithms']);

var bsearchInsert = $notifking._bsearchForInsert;

TD.commonCase('binary search for insertion', function(T) {
  function cmpnum(a, b) {
    return a - b;
  };

  var eLazy = T.lazyLogger('bsearchInsert');
  function testify(arr, val, expected) {
    T.action(eLazy, 'insert ' + val + ' in [' + arr + '] at ' + expected,
             function() {
      eLazy.expect_value(expected);
      eLazy.value(bsearchInsert(arr, val, cmpnum));
    });
  }
  function testifyRange(arr, val, expLow, expHigh) {
    T.action(eLazy, 'insert ' + val + ' in [' +arr + '] in range [' + expLow +
             ', ' + expHigh + ']', function() {
      eLazy.expect_value(true);
      var insertPoint = bsearchInsert(arr, val, cmpnum);
      if (insertPoint >= expLow && insertPoint <= expHigh)
        eLazy.value(true);
      else
        eLazy.value(insertPoint);
    });
  }

  testify([], 0, 0);
  testify([], 1, 0);
  testify([], -1, 0);

  testify([0], 0, 0);
  testify([0], -1, 0);
  testify([0], 1, 1);

  testify([1, 1], 0, 0);
  testify([1, 1], 2, 2);

  testify([1, 1, 1], 0, 0);
  testify([1, 1, 1], 2, 3);

  testifyRange([0, 1, 1, 2],    1,   1, 3);
  testifyRange([0, 1, 1, 1, 2], 1,   1, 4);

  testifyRange([0, 1, 1, 1, 1, 1, 2, 2], 2,   6, 8);

  testify([0, 2, 4, 8], -1, 0);
  testify([0, 2, 4, 8], 1, 1);
  testify([0, 2, 4, 8], 3, 2);
  testify([0, 2, 4, 8], 5, 3);
  testify([0, 2, 4, 8], 7, 3);
});

}); // end define
