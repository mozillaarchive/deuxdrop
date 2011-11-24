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
 * Test the common denominator UI functionality that all UI's should posess:
 * - Signup (trivial success case; no challenges, no failures)
 * - Make friends:
 *   - List connectable peeps (static result list; no updates checked.)
 *   - Initiate a connection with a friendable peep.
 *   - List connection requests (live list; updates checked.)
 *   - Confirm connection request.
 * - List peeps (dynamic list with ordering chosen by the UI and the state
 *     checker using that.)
 * - List conversations involving a peep (dynamic list with ordering chosen
 *     by the UI and the state checker using that.)
 * - Show conversation and its messages (dynamic, updates checked.)
 * - Reply to conversations.
 * - Start new conversations.
 * - Invite someone to an existing conversation.
 *
 * The main difference between this test and the moda shakedown test is that
 *  our baseline UI is assumed to be largely modal and therefore maintaining
 *  relatively few live queries at a time.
 **/

define(
  [
    'rdcommon/testcontext',
    'rdservers/testhelper',
    'rdcommon/moda/testhelper',
    'rdcommon/moda/uitesthelper',
    'module',
    'exports'
  ],
  function(
    $tc,
    $th_rdservers,
    $th_moda,
    $th_ui,
    $module,
    exports
  ) {

var TD = exports.TD = $tc.defineTestsFor($module, null,
  [$th_rdservers.TESTHELPER, $th_moda.TESTHELPER, $th_ui.TESTHELPER],
  ['app']);

TD.commonCase('ui basics', function(T) {
  T.group('setup');

  // only A needs to use moda for our tests.
  var ui_a = T.actor('testUI', 'A', {}),
      client_b = T.actor('testClient', 'B'),
      client_c = T.actor('testClient', 'C');
  var serverOpts = {roles: ['auth', 'signup', 'drop', 'sender', 'store',
                            'fanout']};
  var server_x = T.actor('testServer', 'X', serverOpts),
      server_y = T.actor('testServer', 'Y', serverOpts),
      server_z = T.actor('testServer', 'Z', serverOpts);

  // -- setup
  T.group("signup A");
  ui_a.setup_useServer(server_x);
  T.group("setup headless B, C");
  client_b.setup_useServer(server_y);
  client_c.setup_useServer(server_z);


  T.group("connect to server");
  ui_a.setup_connect();
  client_b.setup_connect();
  client_c.setup_connect();

  // -- friending
  T.group("A requests B");
  // list/find peeps
  ui_a.do_showPossibleFriends([client_b, client_c]);
  // connect process, return to list/find
  ui_a.do_connectToPeep(client_b);
  // switch to our list of peeps so we can see them appear
  ui_a.do_showPeeps();


  T.group("B approves A");
  // have B complete the cycle
  client_b.do_requestContact(ui_a.client);
  // (this should trigger an update visible to ui_a)


  T.group("C requests A");
  // stare at our connect requests
  ui_a.do_showConnectRequests();
  // have C initiate a connect request
  client_c.do_requestContact(ui_a.client);
  // (this should trigger an update visible to ui_a)

  T.group("A approves");
  // have the UI bring up the connect request and approve it
  ui_a.do_approveConnectRequest(client_c);


  // -- conversations
  var tConv1 = T.thing('conversation', 'conv1'),
      tConv1_msg1 = T.thing('message', 'c1:1:a');

  T.group("A starts conversation with B");
  ui_a.do_createConversation(tConv1, tConv1_msg1, [client_b]);


  var tConv2 = T.thing('conversation', 'conv2'),
      tConv2_msg1 = T.thing('message', 'c2:1:c');
  T.group("C starts conversation with A");
  // find C so we can look at our page of conversations with them
  ui_a.do_showPeeps();
  // be looking at the conversations involving C
  ui_a.do_showPeepConversations(client_c);
  // have C create the conversation
  client_c.do_startConversation(tConv2, tConv2_msg1, [ui_a.client]);
});

}); // end define
