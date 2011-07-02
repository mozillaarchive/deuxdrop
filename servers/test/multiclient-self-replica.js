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
 *
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
  [$th_rdservers.TESTHELPER], ['replica']);

TD.commonCase('clone client has state matching the mutator', function(T) {
  T.group("setup");
  // usual client
  var client = T.actor('testClient', 'C');
  // a different client for the same user
  var clone = T.actor('testClient', 'C2', {clone: client});

  // a friend for our client!
  var alice = T.actor('testClient', 'A');

  var serverOpts = {roles: ['auth', 'signup', 'drop', 'sender', 'store',]};
  var server = T.actor('testServer', 'S', serverOpts);

  // signup
  T.group("signup, connect");
  client.setup_useServer(server);
  clone.setup_assumeUsingServer(server);

  T.check('have', server, 'verify', client, 'and', clone,
           'are both signed up', function() {
    server.assertClientAuthorizationState(client, true);
    server.assertClientAuthorizationState(clone, true);
  }).log.boring(false);

  // alice needs to signup somewhere so we can have a server self-ident.
  alice.setup_useServer(server); // ...and the same server is fine.

  client.setup_connect();
  clone.setup_connect();

  T.group("contact addition");

  T.action('have', client, 'add', alice, 'as a contact,', clone,
           'gets a replica update', function() {
    clone.expectReplicaUpdate();
    client.addContact(alice);
  });
  client.setup_addContact(alice).log.boring(false);

  T.group("verify");

  T.check(client, 'knows about the contact it just added', function() {
    client.assertClientHasContact(alice);
  });
  T.check(clone, 'knows about the contact too!', function() {
    clone.assertClientHasContact(alice);
  });

  T.group("cleanup");
});

}); // end define
