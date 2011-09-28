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
 * Loopback testing of the group messaging scenario using three clients.
 **/

define(
  [
    'rdcommon/testcontext',
    'rdservers/testhelper',
    'module',
    'exports'
  ],
  function(
    $tc,
    $th_rdservers,
    $module,
    exports
  ) {

var TD = exports.TD = $tc.defineTestsFor($module, null,
  [$th_rdservers.TESTHELPER], ['app']);

TD.commonCase('group messaging upgrade from one-on-one', function(T) {
  T.group('setup');

  var client_a = T.actor('testClient', 'A'),
      client_b = T.actor('testClient', 'B'),
      client_c = T.actor('testClient', 'C');

  var serverOpts = {roles: ['auth', 'signup', 'drop', 'sender', 'store',
                            'fanout']};
  var server_x = T.actor('testServer', 'X', serverOpts),
      server_y = T.actor('testServer', 'Y', serverOpts),
      server_z = T.actor('testServer', 'Z', serverOpts);
  // (all of the above entities have their own initialization steps)

  // the messages in play...
  var conv = T.thing('conversation', 'conv'),
      msg_a1 = T.thing('message', 'a1'),
      msg_b1 = T.thing('message', 'b1'),
      msg_b2 = T.thing('message', 'b2'),
      msg_c1 = T.thing('message', 'c1');


  client_a.setup_useServer(server_x);
  client_b.setup_useServer(server_y);
  client_c.setup_useServer(server_z);

  client_a.setup_connect();
  client_b.setup_connect();
  client_c.setup_connect();

  T.group("setup: make friend clique: A, B, C");

  // make everybody already be friends with everybody else
  // XXX this would ideally be one of our permutations or just an additional
  //  explicit step (to invite someone who is not a friend of everyone else)
  client_a.setup_friendClique([client_b, client_c]);

  T.group("start 1:1 conversation between A, B");

  client_a.do_startConversation(conv, msg_a1, [client_b]);

  T.group("B responds to the conversation");

  client_b.do_replyToConversationWith(conv, msg_b1);

  T.group("B invites C");

  client_b.do_inviteToConversation(client_c, conv);

  T.group("B sends a message, all hear");

  client_b.do_replyToConversationWith(conv, msg_b2);

  T.group("C sends a message, all hear");

  client_c.do_replyToConversationWith(conv, msg_b2);

  T.group('cleanup');
});

// This is basically the above test but changed so everyone is using the same
//  server.
TD.commonCase('same server', function(T) {
  T.group('setup');

  var client_a = T.actor('testClient', 'A'),
      client_b = T.actor('testClient', 'B'),
      client_c = T.actor('testClient', 'C');

  var serverOpts = {roles: ['auth', 'signup', 'drop', 'sender', 'store',
                            'fanout']};
  var server_x = T.actor('testServer', 'X', serverOpts);
  // (all of the above entities have their own initialization steps)

  // the messages in play...
  var conv = T.thing('conversation', 'conv'),
      msg_a1 = T.thing('message', 'a1'),
      msg_b1 = T.thing('message', 'b1'),
      msg_b2 = T.thing('message', 'b2'),
      msg_c1 = T.thing('message', 'c1');


  client_a.setup_useServer(server_x);
  client_b.setup_useServer(server_x);
  client_c.setup_useServer(server_x);

  client_a.setup_connect();
  client_b.setup_connect();
  client_c.setup_connect();

  T.group("setup: make friend clique: A, B, C");

  // make everybody already be friends with everybody else
  // XXX this would ideally be one of our permutations or just an additional
  //  explicit step (to invite someone who is not a friend of everyone else)
  client_a.setup_friendClique([client_b, client_c]);

  T.group("start 1:1 conversation between A, B");

  client_a.do_startConversation(conv, msg_a1, [client_b]);

  T.group("B responds to the conversation");

  client_b.do_replyToConversationWith(conv, msg_b1);

  T.group("B invites C");

  client_b.do_inviteToConversation(client_c, conv);

  T.group("B sends a message, all hear");

  client_b.do_replyToConversationWith(conv, msg_b2);

  T.group("C sends a message, all hear");

  client_c.do_replyToConversationWith(conv, msg_b2);

  T.group('cleanup');
});


}); // end define
