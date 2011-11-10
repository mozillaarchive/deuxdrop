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
 * Testhelper for spawning and driving a real UI while maintaining a moda-test
 *  representation to represent the believed state of the system.  While the
 *  actual client entirely exists out-of-process, we do maintain a dummied
 *  out 'testClient' stand-in that provides naming and generation/receipt of
 *  notifications to maintain the system state bookkeeping.
 *
 * ## Extracting Client Identity Information ##
 *
 * For realism purposes, we let the client create its own identity information.
 *  Because our test framework wants this information, as part of the initial
 *  client spin-up process, we inject
 *
 * ## Selenium Server ##
 *
 * Currently, we just require that you already have a selenium server running
 *  on localhost and configured to spawn a firefox instance with our xpi
 *  installed.  We provide the "testui.py" script in clients/addon to this end.
 *
 * ## Reduced Test Steps ##
 *
 * Our control over a true-UI client is limited to its UI and when the mailstore
 *  tells it things.  This accordingly reduces both the internal events we
 *  can listen for and the number of test steps that we need to create.  (In
 *  many cases the main reason we create additional test steps, including taking
 *  the effort to suspend messages in transit to that end, is to try and make
 *  the test steps comprehensible to humans by keeping the number of things
 *  going on low.)
 *
 * The following changes in test steps are made:
 * - Communication between the moda bridge and the moda backside is no longer
 *   trapped, eliminating a step.  (We could transparently hoook the messages
 *   if we need to.)
 * - The step when a mailstore delivers a message to its testClient is
 *   greatly simplified because we only see the transmission of the message
 *   by the mailstore and then the UI result.
 **/

define(function(require, exports, $module) {

var $Q = require('q'),
    when = $Q.when;

var $testdata = require('rdcommon/testdatafab'),
    $log = require('rdcommon/log');

var $wdloggest = require('rduidriver/wdloggest'),
    $devui_driver = require('rduidriver/devui');

var fakeDataMaker = $testdata.gimmeSingletonFakeDataMaker();

var TestUIActorMixins = {
  __constructor: function(self, opts) {
    // - create a faux testClient for identification/hookup purposes.
    self.client = {
    };

    self.T.convenienceSetup(self, 'creates webdriver', function() {
      self._lwd = new $wdloggest.LoggestWebDriver(
                    self.client.__name, self.T, self._log);
      self._uid = new $devui_driver.DevUIDriver(self.T, self.client,
                                                self._lwd, self._log);
    });
  },

  //////////////////////////////////////////////////////////////////////////////
  // Setup
  /**
   * Run the signup process to completion for the given server.
   */
  setup_useServer: function(server) {
    this._uid.act_signup(server);
  },

  /**
   * Force the UI to connect to its server.
   */
  setup_connect: function() {
    this._uid.act_connect();
  },

  //////////////////////////////////////////////////////////////////////////////
  // Peep-related actions

  /**
   * Bring up the list of possible friends, noting that this UI page is a
   *  temporary stopgap with privacy concerns.
   *
   * @args[
   *   @param[otherClients @listof[TestClient]]{
   *     The expected list of friendable things.  No part of the test
   *     infrastructure automatically derives this right now...
   *   }
   * ]
   */
  do_showPossibleFriends: function(otherClients) {
    var self = this;
    self._uid.showPage_possibleFriends();
    self._uid.verify_possibleFriends(otherClients);
  },

  /**
   * Initiate a connect request to the given peep, operating under the
   *  assumption that the current UI page is showing us this peep somewhere.
   *  If the UI shows a confirmation page with details, this automatically
   *  completes the connection process from that page.
   */
  do_connectToPeep: function(otherClient, interesting) {
    var self = this;
    self._uid.act_issueConnectRequest(otherClient);
  },

  /**
   * Bring up the list of unhandled, received connection requests.
   */
  do_showConnectRequests: function() {
    var self = this;
    self._uid.showPage_connectRequests();
    // XXX moda rep knows connect requests...
    self._uid.verify_connectRequests();
  },

  /**
   * Select and approve a connection request from the given client.  This should
   *  be used when do_showConnectRequests is in effect.
   */
  do_approveConnectRequest: function(otherClient) {
    var self = this;
    self._uid.act_approveConnectRequest(otherClient);
  },

  /**
   * Bring up the list of connected contacts and verify that all our connected
   *  peeps are listed.
   */
  do_showPeeps: function() {
    var self = this;
    self._uid.showPage_peeps();
    // XXX moda knows peeps
    self._uid.verify_peeps();
  },

  //////////////////////////////////////////////////////////////////////////////
  // Conversation browsing

  /**
   * Bring up a list of conversations involving the peep associated with the
   *  given client.
   */
  do_showPeepConversations: function(otherClient) {
    var self = this;
    self._uid.showPage_peepConversations(otherClient);
    // XXX moda knows conversations
    self._uid.verify_conversations();
  },

  /**
   * Display a conversation that is already visible thanks to a call to
   *  `do_showPeepConversations`.
   */
  do_openPeepConversation: function(tConv) {
    var self = this;

  },

  //////////////////////////////////////////////////////////////////////////////
  // Conversation manipulation

  /**
   * Create a conversation with the given set of initial recipients.  It's up to
   *  the UI how it does this.
   */
  do_createConversation: function(tConv, tMsg, recipients) {
    var self = this;
  },

  /**
   * Reply to the existing and currently displayed conversation.  The UI should
   *  use an affordance on the conversation display.
   */
  do_replyToConversationWith: function(tConv, tNewMsg) {
  },

  /**
   * Invite a client to the existing and currently displayed conversation.
   */
  do_inviteToConversation: function(invitedClient, tConv) {
  },

  //////////////////////////////////////////////////////////////////////////////
};

exports.TESTHELPER = {
  // we leave it to the testClient TESTHELPER to handle most stuff, leaving us
  //  to just worry about moda.
  LOGFAB_DEPS: [LOGFAB,
    $moda_backside.LOGFAB, $ls_tasks.LOGFAB,
  ],

  actorMixins: {
    testModa: TestModaActorMixins,
  },
};

}); // end define
