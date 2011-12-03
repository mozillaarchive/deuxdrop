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
 * Perform basic moda functionality tests:
 * - Live Lists:
 *   - Peep Lists
 *     - Peep list updates when a new peep is added
 *     - Non-alphabetical peep list updates locations on message events
 *     - (Updates when peep metadata changes: pinned, # involved, # unread)
 *   - Conversation lists (global, global pinned, per-peep, per-peep pinned)
 *     - New conversations get added.
 *     - New messages in conversations cause conversations to bubble up.
 *     - (Updates when metadata changes: # unread, other)
 *   - Conversation (messages)
 *     - New messages get added
 *     - Read status gets updated on replica say-so
 * - Blurbs
 *   - Peep updates (pinned, # involved, # unread)
 *   - Conversation updates (pinned, # unread, etc.)
 * - Notification coalescing after updates
 *
 * The notable/distinct set of things we are hoping to test with this are:
 * - "All" set membership transitions.
 * - Filtered set membership transitions.
 * - Metadata changes that should generate notifications are actually occurring.
 *
 * A lot of the notification operations that occur are redundant and exercise
 *  common path, so we don't actually need to test them.
 *
 *
 * For reasons of (test) implementation simplicity, moda tests constitute a
 *  superset of server tests.  Specifically, we make the servers do all the
 *  same work they do in their own tests because that is the simplest (and
 *  therefore best) way to get realism.  As a future optimization, we may avoid
 *  logging the data of the server activities, but for now it seems helpful to
 *  keep around even if it does increase storage requirements and load times.
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

TD.commonCase('moda basics', function(T) {
  T.group('setup');

  // only A needs to use moda for our tests.
  var client_a = T.actor('testClient', 'A', {moda: true}),
      moda_a = T.actor('testModa', 'mA', {client: client_a}, client_a),
      client_b = T.actor('testClient', 'B'),
      client_c = T.actor('testClient', 'C');
  var serverOpts = {roles: ['auth', 'signup', 'drop', 'sender', 'store',
                            'fanout']};
  var server_x = T.actor('testServer', 'X', serverOpts),
      server_y = T.actor('testServer', 'Y', serverOpts),
      server_z = T.actor('testServer', 'Z', serverOpts);

  var lqServers = moda_a.do_queryServers('servers');
  // (lqServers is optional; we will automatically do this query bit if it's
  //  not explicitly done.  We're just expanding it here to make the test steps
  //  more explicit.)
  moda_a.setup_useServer(server_x, lqServers);
  moda_a.do_killQuery(lqServers);

  client_b.setup_useServer(server_y);
  client_c.setup_useServer(server_z);

  client_a.setup_connect();
  client_b.setup_connect();
  client_c.setup_connect();

  // -- peep live-updating queries
  T.group("A live-updating queries");
  // - create a live query on the set of our peeps
  var lqAllPeeps = moda_a.do_queryPeeps("allPeeps", {by: 'alphabet'});
  //var lqPinnedPeeps = moda_a.do_queryPeeps();

  T.group("A friend B");

  // - add B as a friend
  // (this will automatically check notification handling)
  client_a.setup_friendClique([client_b]);

  // the all query should have gained B.
  // the pinned query should not have

  // - pin B
  // the all query should have noticed that B is pinned
  // the pinned query should have gained B

  // - find possible friends (which is C)
  T.group("list possible friends (C)");
  var lqPossibleFriends = moda_a.do_queryPossibleFriends('friendable1',
                                                         [client_c]);

  // - add C as a friend
  T.group("add C as friend via suggestion");
  client_a.setup_friendClique([client_c]);

  // forget about our lqPossibleFriends
  moda_a.do_killQuery(lqPossibleFriends);

  // -- peep final state queries.
  T.group("peep query permutation checking: reuse, non-reuse, stay dead");
  // reuse case
  var lqFinalAllPeeps = moda_a.do_queryPeeps("allPeepsFinal", {by: 'alphabet'});
  // kill the queries to get a non-reuse case
  moda_a.do_killQuery(lqAllPeeps);
  moda_a.do_killQuery(lqFinalAllPeeps);
  // Reissue allPeeps
  lqAllPeeps = moda_a.do_queryPeeps("allPeeps2", {by: 'alphabet'});
  // Additionally, we get test coverage from making sure the dead queries stay
  //  dead because we should error out if we hear about an unknown query.  (And
  //  notifications would be generated for involved conv count changes, etc.)

  // --- conversations
  T.group("A live-updating conversation queries");
  // - issue B and C live queries, both initially empty
  var lqBconvBlurbs = moda_a.do_queryPeepConversations(
                        'BconvBlurbs', lqAllPeeps, client_b, {by: 'any'});
  var lqCconvBlurbs = moda_a.do_queryPeepConversations(
                        'CconvBlurbs', lqAllPeeps, client_c, {by: 'any'});
  var lqAllConvBlurbs = moda_a.do_queryAllConversations(
                        'allConvBlurbs', { by: 'all' });

  // - create a conversation between A and B
  T.group('new conversation #1 between A, B');
  var tConv1 = T.thing('conversation', 'conv1'),
      tConv1_msg1 = T.thing('message', 'c1:1:a');
  moda_a.do_createConversation(tConv1, tConv1_msg1, lqAllPeeps, [client_b]);

  // the B query should now contain the conversation... (but not C)
  // ??? these could perhaps be checked automatically, or via a
  // "checkAllOutstandingQueries" type mechanism... or on query completed?
  moda_a.check_queryContainsConvBlurbs(lqBconvBlurbs, [tConv1]);
  moda_a.check_queryContainsConvBlurbs(lqCconvBlurbs, []);
  moda_a.check_queryContainsConvBlurbs(lqAllConvBlurbs, [tConv1]);

  // - make sure that the conversation addition did not screw up our peeps list
  T.group('check peeps list after conversation join');
  lqFinalAllPeeps = moda_a.do_queryPeeps("allPeepsFinal:any", {by: 'any'});

  // - query on the messages in the conversation
  T.group('messages query on the conversation');
  var lqConv1Msgs = moda_a.do_queryConversationMessages(
                      'conv1:msgs', lqBconvBlurbs, tConv1);

  // - have B reply to the conversation (not using moda)
  T.group('B replies (non-moda)');
  var tConv1_msg2 = T.thing('message', 'c1:2:b');
  client_b.do_replyToConversationWith(tConv1, tConv1_msg2);

  // XXX the conversation blurb object unread count should have been increased
  moda_a.check_queryContainsConvBlurbs(lqBconvBlurbs, [tConv1]);
  moda_a.check_queryContainsConvBlurbs(lqCconvBlurbs, []);

  T.group('A replies (moda)');
  var tConv1_msg3 = T.thing('message', 'c1:2:a');
  moda_a.do_replyToConversationWith(tConv1, tConv1_msg3, lqBconvBlurbs);

  moda_a.check_queryContainsConvBlurbs(lqBconvBlurbs, [tConv1]);
  moda_a.check_queryContainsConvBlurbs(lqCconvBlurbs, []);

  // - A invites C to the conversation (using moda)
  T.group('A invites C');
  moda_a.do_inviteToConversation(lqAllPeeps, client_c, tConv1, lqBconvBlurbs);

  moda_a.check_queryContainsConvBlurbs(lqBconvBlurbs, [tConv1]);
  moda_a.check_queryContainsConvBlurbs(lqCconvBlurbs, [tConv1]);

  // the conversation blurb should now know that C is involved in the conv
  // the C query should now contain the conversation...

  // - create a conversation between A,B,C
  T.group('A starts new conversation #2 between A, B, C');
  var tConv2 = T.thing('conversation', 'conv2'),
      tConv2_msg1 = T.thing('message', 'c2:1:a');
  moda_a.do_createConversation(tConv2, tConv2_msg1, lqAllPeeps,
                               [client_b, client_c]);

  // both queries should now contain the conversation..
  moda_a.check_queryContainsConvBlurbs(lqBconvBlurbs, [tConv2, tConv1]);
  moda_a.check_queryContainsConvBlurbs(lqCconvBlurbs, [tConv2, tConv1]);
  moda_a.check_queryContainsConvBlurbs(lqAllConvBlurbs, [tConv2, tConv1]);

// XXX leaving this alive results in a test failure where the next message send
//  is expected to trigger a dependent query update; that needs to be fixed
//  but not quite yet as I have another test failure in my sights.
  moda_a.do_killQuery(lqConv1Msgs);

  // - have B reply to conv 2, bumping the conversation..
  T.group('B replies to the conversation');
  var tConv2_msg2 = T.thing('message', 'c2:2:b');
  client_b.do_replyToConversationWith(tConv2, tConv2_msg2);

  // - have B initiate a conversation
  // this results in a different notification chain from a's perspective
  T.group('B starts new conversation #3 between A, B');
  var tConv3 = T.thing('conversation', 'conv3'),
      tConv3_msg1 = T.thing('message', 'c3:1:b');
  client_b.do_startConversation(tConv3, tConv3_msg1, [client_a]);

  // - conversation loading without use
  T.group('conversation queries without reuse');
  moda_a.do_killQuery(lqBconvBlurbs);
  moda_a.do_killQuery(lqCconvBlurbs);
  moda_a.do_killQuery(lqAllConvBlurbs);

  var lqBconvBlurbs2 = moda_a.do_queryPeepConversations(
                         'BconvBlurbs2', lqAllPeeps, client_b, {by: 'any'}),
      lqCconvBlurbs2 = moda_a.do_queryPeepConversations(
                         'CconvBlurbs2', lqAllPeeps, client_c, {by: 'any'}),
      lqAllConvBlurbs2 = moda_a.do_queryAllConversations(
                           'allConvBlurbs2', { by: 'all' });
  moda_a.check_queryContainsConvBlurbs(lqBconvBlurbs2,
                                       [tConv3, tConv2, tConv1]);
  moda_a.check_queryContainsConvBlurbs(lqCconvBlurbs2,
                                       [tConv2, tConv1]);
  moda_a.check_queryContainsConvBlurbs(lqAllConvBlurbs2,
                                       [tConv3, tConv2, tConv1]);

  T.group("cleanup");
  moda_a.do_killQuery(lqAllPeeps);
  moda_a.do_killQuery(lqFinalAllPeeps);
});

}); // end define
