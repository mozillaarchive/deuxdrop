/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test the moda newness logic more extensively than in moda-shakedown.  The
 *  shakedown test covers setting of newness when new messages are received
 *  and clearing of newness when messages are marked as read.  It does not
 *  cover the explicit 'clearNewness' mechanism that clears newness without
 *  marking things read.  It also does not attempt to verify that the
 *  persistence logic does the right thing.  We test both of these things.
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

TD.commonCase('moda newness', function(T) {
  T.group('setup');

  // only A needs to use moda for our tests.
  var client_a = T.actor('testClient', 'A', {moda: true}),
      moda_a = T.actor('testModa', 'mA', {client: client_a}, client_a),
      client_b = T.actor('testClient', 'B');
  var serverOpts = {roles: ['auth', 'signup', 'drop', 'sender', 'store',
                            'fanout']};
  var server_x = T.actor('testServer', 'X', serverOpts),
      server_y = T.actor('testServer', 'Y', serverOpts);

  moda_a.setup_useServer(server_x);
  client_b.setup_useServer(server_y);

  client_a.setup_connect();
  client_b.setup_connect();

  client_a.setup_friendClique([client_b]);

  // -- setup specific to this test
  T.group("special setup");
  // - disable newness state persistence
  // This makes it easier for us to verify the persistence logic does the
  //  right thing inside of a batch.
  client_a.do_newnessDisablePersistence();

  // -- test proper
  // We're going to have B create all the conversations and follow-up messages
  //  because it reduces logging and is semantically less confusing in terms
  //  of why things may or may not get marked read.

  // - create a newness query
  T.group("create queries");
  var lqNewConvs = moda_a.do_queryNewConversationActivity('newConvs'),
      lqAllConvBlurbs = moda_a.do_queryAllConversations(
                          'allConvBlurbs', { by: 'all' });

  // - create conv #1, read nothing from it
  T.group("create conv #1 with 2 messages");
  var tConv1 = T.thing('conversation', 'conv1'),
      tConv1_msg1 = T.thing('message', 'c1:1:b');
  client_b.do_startConversation(tConv1, tConv1_msg1, [client_a]);
  var tConv1_msg2 = T.thing('message', 'c1:2:b');
  client_b.do_replyToConversationWith(tConv1, tConv1_msg2);

  // - create conv #2, read part of it
  T.group("create conv #2 with 2 messages");
  var tConv2 = T.thing('conversation', 'conv2'),
      tConv2_msg1 = T.thing('message', 'c2:1:b');
  client_b.do_startConversation(tConv2, tConv2_msg1, [client_a]);
  var tConv2_msg2 = T.thing('message', 'c2:2:b');
  client_b.do_replyToConversationWith(tConv2, tConv2_msg2);

  T.group("read only 1 of the 2 messages in conv #2");
  var lqConv2Msgs = moda_a.do_queryConversationMessages(
                      'conv2:msgs', lqAllConvBlurbs, tConv2);
  moda_a.do_markAsRead(lqConv2Msgs, tConv2, -2);

  // - create conv #3, read all of it
  // (as a result, no new state should be persisted on flush!)
  T.group("create conv #3 with 2 messages");
  var tConv3 = T.thing('conversation', 'conv3'),
      tConv3_msg1 = T.thing('message', 'c3:1:b');
  client_b.do_startConversation(tConv3, tConv3_msg1, [client_a]);
  var tConv3_msg2 = T.thing('message', 'c3:2:b');
  client_b.do_replyToConversationWith(tConv3, tConv3_msg2);

  T.group("read all of the messages in conv #3");
  var lqConv3Msgs = moda_a.do_queryConversationMessages(
                      'conv3:msgs', lqAllConvBlurbs, tConv3);
  moda_a.do_markAsRead(lqConv3Msgs, tConv3);

  // - nuke the newness query
  // We do this because it's not useful/sane to test the correctness of the
  //  query persisting through the emulation of a power cycling...
  T.group("nuke newness query");
  moda_a.do_killQuery(lqNewConvs);

  // - white box check of the newness state
  T.group("inspect newness state rep internals");
  var expectedNewness = [
    [tConv1, 1, 4], // (join, join, msg1, msg2)
    [tConv2, 4, 4], // (msg2)
  ];
  client_a.check_newnessStateRep('state', expectedNewness);
  client_a.check_newnessStateRep('dirty', expectedNewness);
  client_a.check_newnessStateRep('written', []);

  // - compel a disk flush and reload of the newness state
  T.group("flush newness state to DB, check state rep");
  client_a.do_newnessPersist();
  client_a.check_newnessStateRep('state', expectedNewness);
  client_a.check_newnessStateRep('dirty', null);
  client_a.check_newnessStateRep('written', expectedNewness);

  T.group("reset state, reload from db, check state rep");
  client_a.do_newnessResetAndDepersist();
  client_a.check_newnessStateRep('state', expectedNewness);
  client_a.check_newnessStateRep('dirty', null);
  client_a.check_newnessStateRep('written', expectedNewness);

  // - re-create the newness query, make sure it's still correct
  T.group("re-create newness query");
  lqNewConvs = moda_a.do_queryNewConversationActivity('newConvs2');

  // - clear the newness without marking read
  T.group("perform explicit newness clearing without marking read");
  moda_a.do_clearNewness(lqNewConvs, [tConv1, tConv2]);

  // - inspect state rep internals
  T.group("inspect newness state rep internals");
  client_a.check_newnessStateRep('written', expectedNewness);
  expectedNewness = [];
  client_a.check_newnessStateRep('state', expectedNewness);
  var expectedDirty = [
    [tConv1, null, null],
    [tConv2, null, null],
  ];
  client_a.check_newnessStateRep('dirty', expectedDirty);

  T.group("cleanup");
  client_a.do_newnessEnablePersistence();
});

}); // end define
