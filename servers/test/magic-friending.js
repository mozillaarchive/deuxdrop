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

TD.commonCase('have two contacts be friends using magic rendezvous',
              function(T) {
  T.group('setup');

  var client_a = T.actor('testClient', 'A'),
      client_b = T.actor('testClient', 'B');

  var serverOpts = {roles: ['auth', 'signup', 'drop', 'sender', 'store',]};
  var server_x = T.actor('testServer', 'X', serverOpts),
      server_y = T.actor('testServer', 'Y', serverOpts);

  client_a.setup_useServer(server_x);
  client_b.setup_useServer(server_y);

  client_a.setup_connect();
  client_b.setup_connect();

  T.group('add contacts');

  // Establish the friendship relationship on the basis of cheaty action at
  //  a distance of the self-ident blobs.
  client_a.setup_addContact(client_b).log.boring(false);
  client_b.setup_addContact(client_a).log.boring(false);

  // Verify the clients and their servers
  T.group('verify');

  T.check(client_a, 'has contact', client_b, function() {
    client_a.assertClientHasContact(client_b);
  });
  T.check(client_b, 'has contact', client_a, function() {
    client_b.assertClientHasContact(client_a);
  });


  T.group('cleanup');
});

}); // end define
