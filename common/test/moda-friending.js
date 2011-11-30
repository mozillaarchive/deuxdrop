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
 * Test the connect request support.  This does not live in moda-shakedown
 *  because moda-shakedown is already complicated enough and by having moda
 *  on both sides of the equation in this test we reduce the number of steps
 *  required.
 **/

define(
  [
    'rdcommon/testcontext',
    'rdservers/testhelper',
    'rdcommon/moda/testhelper',
    'module',
    'exports'
  ],
  function(
    $tc,
    $th_rdservers,
    $th_moda,
    $module,
    exports
  ) {

var TD = exports.TD = $tc.defineTestsFor($module, null,
  [$th_rdservers.TESTHELPER, $th_moda.TESTHELPER], ['app']);

TD.commonCase('moda friending', function(T) {
  T.group('setup');

  // only A needs to use moda for our tests.
  var client_a = T.actor('testClient', 'A', {moda: true}),
      moda_a = T.actor('testModa', 'mA', {client: client_a}, client_a),
      client_b = T.actor('testClient', 'B', {moda: true}),
      moda_b = T.actor('testModa', 'mB', {client: client_b}, client_b);
  var serverOpts = {roles: ['auth', 'signup', 'drop', 'sender', 'store',
                            'fanout']};
  var server_x = T.actor('testServer', 'X', serverOpts),
      server_y = T.actor('testServer', 'Y', serverOpts);

  moda_a.setup_useServer(server_x);
  moda_b.setup_useServer(server_y);

  client_a.setup_connect();
  client_b.setup_connect();

  T.group('A queries conn requests (for dynamic update)');
  var lqaRequests = moda_a.do_queryConnectRequests('reqsA-before');

  T.group('B finds A');
  var lqbPossibleFriends = moda_b.do_queryPossibleFriends('possfriendsB',
                                                          [client_a]);

  T.group('B requests friendship with A');
  moda_b.do_connectToPeep(lqbPossibleFriends, client_a, true);

  T.group('A queries conn requests (already populated)');
  var lqaStaticRequests = moda_a.do_queryConnectRequests('reqsA-after');

  T.group('kill both queries and re-issue for non-reuse case');
  moda_a.do_killQuery(lqaRequests);
  moda_a.do_killQuery(lqaStaticRequests);
  var lqaStatic2Requests = moda_a.do_queryConnectRequests('reqsA-after');

  T.group('A responds based on the request');
  moda_a.do_connectToPeep(lqaStatic2Requests, client_b, true);
  // (an expectation should have been generated that the connection request
  //  has now been removed).

  T.group('kill and reissue static query to make sure the conn req is gone');
  moda_a.do_killQuery(lqaStatic2Requests);
  var lqaStatic3Requests = moda_a.do_queryConnectRequests('reqsA-after');

  T.group("cleanup");
});

TD.commonCase('moda rejection', function(T) {
  T.group('setup');

  // only A needs to use moda for our tests.
  var client_a = T.actor('testClient', 'A', {moda: true}),
      moda_a = T.actor('testModa', 'mA', {client: client_a}, client_a),
      client_b = T.actor('testClient', 'B', {moda: true}),
      moda_b = T.actor('testModa', 'mB', {client: client_b}, client_b);
  var serverOpts = {roles: ['auth', 'signup', 'drop', 'sender', 'store',
                            'fanout']};
  var server_x = T.actor('testServer', 'X', serverOpts),
      server_y = T.actor('testServer', 'Y', serverOpts);

  moda_a.setup_useServer(server_x);
  moda_b.setup_useServer(server_y);

  client_a.setup_connect();
  client_b.setup_connect();

  T.group('A queries conn requests (for dynamic update)');
  var lqaRequests = moda_a.do_queryConnectRequests('reqsA-before');

  T.group('B finds A');
  var lqbPossibleFriends = moda_b.do_queryPossibleFriends('possfriendsB',
                                                          [client_a]);

  T.group('B requests friendship with A');
  moda_b.do_connectToPeep(lqbPossibleFriends, client_a, true);

  T.group('A rejects the request');
  moda_a.do_rejectConnectRequest(lqaRequests, client_b, true);
  // (we should see the connection request disappear here)

  T.group('kill the query and re-issue for non-reuse case');
  moda_a.do_killQuery(lqaRequests);
  var lqaRequests2 = moda_a.do_queryConnectRequests('reqsA-after');

  T.group("cleanup");
});

}); // end define
