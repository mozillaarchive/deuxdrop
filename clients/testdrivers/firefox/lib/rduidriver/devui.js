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
 * Helper logic to drive the deuxdrop Development UI using WebDriver and verify
 *  the correct things are displayed.  This is intended to be invoked by higher
 *  level tests using the moda system state representation in order to be able
 *  to know what should be displayed by the UI.
 **/

define(
  [
    'rdcommon/log',
    'exports'
  ],
  function(
    $log,
    exports
  ) {

/**
 * Derive the wmsy CSS class name for the given element.
 */
function dwc(domain, moduleId, widgetName, elemName) {
  return domain + '--' + moduleId + '--' + widgetName + '--' + elemName;
}

const
  // tab framework
  clsTabHeaderRoot = dwc('tabs', 'tabs', 'tab-header', 'root'),
  clsTabHeaderLabel = dwc('tabs', 'tabs', 'tab-header', 'label'),
  clsTabHeaderClose = dwc('tabs', 'tabs', 'tab-header', 'close'),
  // specific tab widget roots
  clsTabSignup = dwc('tabs', 'tab-signup', 'signup-tab', 'root'),
  clsTabAcceptRequest = dwc('tabs', 'tab-common', 'accept-request-tab', 'root'),
  // signup tab
  clsSignupOtherServer = dwc('tabs', 'tab-signup', 'signup-tab', 'otherServer'),
  clsSignupSignup = dwc('tabs', 'tab-signup', 'signup-tab', 'btnSignup'),
  // home tab buttons
  clsHomeMakeFriends = dwc('tabs', 'tab-home', 'home-tab', 'btnMakeFriends'),
  clsHomeFriendRequests = dwc('tabs', 'tab-home', 'home-tab',
                              'btnFriendRequests'),
  clsHomeListFriends = dwc('tabs', 'tab-home', 'home-tab', 'btnListFriends'),
  clsHomeCompose = dwc('tabs', 'tab-home', 'home-tab', 'btnCompose'),
  // connection requests
  clsConnReqRoot = dwc('moda', 'tab-common', 'conn-request', 'root'),
  // peeps
  clsPeepBlurbName = dwc('moda', 'tab-common', 'peep-blurb', 'name'),
  // poco editing
  clsPocoEditName = dwc('moda', 'tab-signup', 'poco-editor', 'displayName'),

  blah;

const UI_URL = 'about:dddev';

/**
 * Tab-wise, our approach is that:
 * - We always leave the root tab around as our means of getting at
 *    functionality.
 * - We always have one active 'page' at any given time, and we keep it alive
 *    until we explicitly move to a new page (or back to the root).
 *
 * The bits of our test where we are waiting for something to happen use an
 *  event-driven mechanism supported by built-in moda functionality.
 *  Specifically, moda will call a list of callbacks after receiving events
 *  across its bridge.  We use this to only check DOM state when something
 *  has changed.  We could also use wmsy's id namespace support to do something
 *  clever along these lines, but we don't expect all UIs to use wmsy, so we
 *  don't.
 *
 * @args[
 *   @param[webdriver WebDriver]{
 *     The webdriver instance to use; we are responsible for opening the UI's
 *     tab.
 *   }
 * ]
 */
function DevUIDriver(client, wdloggest) {
  this._d = wdloggest;

  this._activeTab = null;

  this._eHomeTabLabel = this._eMakeFriendsBtn = this._eShowPeepsBtn =
    this._eShowConnectRequestsBtn = this._eComposeBtn = null;
}
DevUIDriver.prototype = {
  startUI: function() {
    this._d.navigate(UI_URL);

    this._d.waitForModa('whoami');
    this._checkTabDelta({signup: 1, errors: 1}, "signup");
  },

  //////////////////////////////////////////////////////////////////////////////
  // Helpers


  /**
   * Retrieve the current set of tabs
   */
  _grabTabState: function() {
    var self = this;
    when(
      this._d.frobElementsByClass(clsTabHeaderRoot, null, [
                                    [clsTabHeaderLabel, 'text'],
                                    [null, 'attr', 'selected'],
                                    [null, 'attr', 'wantsAttention'],
                                  ]),
      function(results) {
      });
  },
  _assertGetTab: function(tabClass) {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Signup Mode

  act_signup: function(server) {
    var eSignupTab = null; // XXX magic up the tab reference

    // - name ourselves
    var eName = this._d.findElement({className: clsPeepBlurbName}, eSignupTab);
    this._d.typeInTextBox(eName, client.__name);

    // - select the server to use
    var eOtherServer = this._d.findElement({className: clsSignupOtherServer},
                                           eSignupTab);

    var eSignupButton = this._d.findElement({className: clsSignupSignup},
                                            eSignupTab);

    // - trigger signup
    this._d.click(eSignupButton);
    // - wait for signup to complete
    this._d.waitForModa('signupResult');
    // the signup tab should have gone away...
    // the signed-up tab should have shown up in the background...
    // the home tab should have shown up, focused
    this._checkTabDelta({signup: -1, "signed-up": 1, home: 1}, 'home');
  },

  //////////////////////////////////////////////////////////////////////////////
  // Steady-state usage

  _hookupHomeTab: function() {

  },

  showPage_possibleFriends: function() {
    // go to the root tab
    // hit the list possible friends button
    // wait for the tab to show up
  },

  showPage_peeps: function() {
  },

  showPage_connectRequests: function() {
  },

  showPage_peepConversations: function() {
  },


  act_approveConnectRequest: function() {
    // locate the connect request
    // click on it

    // this should pop up a new tab with details

    // confirm the connection
  },

  act_createConversation: function() {
    // go to the root tab
    // hit the create a conversation button

    // - add the peep(s)
    // hit add
    // locate the peep in the list
    // click the peep
    // verify the peep showed up

    // type in the message

    // hit send
  },

  //////////////////////////////////////////////////////////////////////////////
};

}); // end define
