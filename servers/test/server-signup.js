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
 * Test that a client can create a new identity and signup with a server.
 *  Because this is the kind of thing every test has to do, most of the logic is
 *  actually in the testhelpers and this ends up being a very boring test that
 *  exists just so we can have a test for this simple case so if we break it,
 *  it's easier to track down as it's a prerequisite for all the complex tests
 *  that will also break.
 **/

define(
  [
    'rdcommon/testcontext',
    'rdservers/testhelper',
    'rdcommon/rawclient/api',
    'module',
    'exports'
  ],
  function(
    $tc,
    $th_rdservers,
    $rawclient_api,
    $module,
    exports
  ) {

var TD = exports.TD = $tc.defineTestsFor($module, null,
  [$th_rdservers.TESTHELPER], ['app']);

TD.commonCase('create new identity, signup with server', function(T) {
  var client = T.actor('testClient', 'C');
  var server = T.actor('testServer', 'S', {roles: ['auth', 'signup']});

  T.check('have', server, 'verify', client,
           'is not authorized before we signup', function() {
    server.assertClientAuthorizationState(client, false);
  });

  // signup; this waits for the confirmations...
  client.setup_useServer(server).log.boring(false); // rebrand it as not boring

  T.check('have', server, 'verify', client,
           'is authorized now that we signed up', function() {
    server.assertClientAuthorizationState(client, true);
  });

});

}); // end define
