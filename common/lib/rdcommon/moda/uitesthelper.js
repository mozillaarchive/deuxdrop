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
 * ## Selenium Server ##
 *
 * Currently, we just require that you already have a selenium server running
 *  on localhost.  We provide a shell script to help out with the required
 *  mechanics of:
 * - Causing an XPI for our extension to be created.
 * - Telling the selenium server to include the extension in its dynamically
 *    created profiles.
 *
 **/

define(function(require, exports, $module) {

var $Q = require('q'),
    when = $Q.when;

var $testdata = require('rdcommon/testdatafab');

var $log = require('rdcommon/log');


var fakeDataMaker = $testdata.gimmeSingletonFakeDataMaker();

var TestUIActorMixins = {
  __constructor: function(self, opts) {
    // - create a faux testClient for identification/hookup purposes.

  },

  //////////////////////////////////////////////////////////////////////////////
  // Setup
  /**
   * Run the signup process to completion for the given server.
   */
  setup_useServer: function() {
  },

  /**
   * Force the UI to connect to its server.
   */
  setup_connect: function() {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Peep-related actions

  /**
   * Bring up the list of possible friends, noting that this UI page is a
   *  temporary stopgap with privacy concerns.
   */
  do_showPossibleFriends: function() {
  },

  /**
   * Initiate a connect request to the given peep, operating under the
   *  assumption that the current UI page is showing us this peep somewhere.
   *  If the UI shows a confirmation page with details, this automatically
   *  completes the connection process from that page.
   */
  do_connectToPeep: function(otherClient, interesting) {
  },

  /**
   * Bring up the list of unhandled, received connection requests.
   */
  do_showConnectRequests: function() {
  },

  /**
   * Select and approve a connection request from the given client.  This should
   *  be used when do_showConnectRequests is in effect.
   */
  do_approveConnectRequest: function(otherClient) {
  },

  /**
   * Bring up the list of connected contacts and verify that all our connected
   *  peeps are listed.
   */
  do_showPeeps: function() {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Conversation browsing

  /**
   * Bring up a list of conversations involving the peep associated with the
   *  given client.
   */
  do_showPeepConversations: function(otherClient) {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Conversation manipulation

  /**
   * Create a conversation with the given set of initial recipients.  It's up to
   *  the UI how it does this.
   */
  do_createConversation: function(tConv, tMsg, recipients) {
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
