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
    'q',
    'rdcommon/log',
    'module',
    'exports'
  ],
  function(
    $Q,
    $log,
    $module,
    exports
  ) {
const when = $Q.when;

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
  clsTabHome = dwc('tabs', 'tab-home', 'home-tab', 'root'),
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
  clsConnReqName = dwc('moda', 'tab-common', 'conn-request', 'peep'),
  clsConnReqMessage = dwc('moda', 'tab-common', 'conn-request', 'messageText'),
  clsAcceptConnAccept = dwc('tabs', 'tab-common', 'accept-request-tab',
                            'btnAccept'),
  clsAuthorConnSend = dwc('moda', 'tab-common', 'author-contact-request-tab',
                          'btnSend'),
  // peeps
  clsPeepBlurb = dwc('moda', 'tab-common', 'peep-blurb', 'root'),
  clsPeepBlurbName = dwc('moda', 'tab-common', 'peep-blurb', 'name'),
  clsPeepInlineRoot = dwc('moda', 'tab-common', 'peep-inline', 'root'),
  clsPeepInlineName = dwc('moda', 'tab-common', 'peep-inline', 'name'),
  // poco editing
  clsPocoEditName = dwc('moda', 'tab-signup', 'poco-editor', 'displayName'),
  // conversations
  clsConvBlurb = dwc('moda', 'tab-common', 'conv-blurb', 'root'),
  clsConvBlurbText = dwc('moda', 'tab-common', 'conv-blurb',
                         'firstMessageText'),
  // compose
  clsComposePeepsList = dwc('moda', 'tab-common', 'conv-compose', 'peeps'),
  clsComposeAddPeep = dwc('moda', 'tab-common', 'conv-compose', 'btnAddPeep'),
  clsComposeText = dwc('moda', 'tab-common', 'conv-compose', 'messageText'),
  clsComposeSend = dwc('tabs', 'tab-common', 'conv-compose-tab', 'btnSend'),
  clsPeepPopPeeps = dwc('moda', 'tab-common', 'peep-selector-popup', 'peeps'),

  blah;

const UI_URL = 'about:dddev';

/**
 * `frobElements` grabData definition for our retrieval of the tabbed UI's
 *  state.
 */
const TABFROB_DEF = [
  {
    roots: clsTabHeaderRoot,
    data: [
      [clsTabHeaderLabel, 'text'],
      [null, 'jsprop', 'binding', 'obj', 'kind'],
      [null, 'attr', 'selected'],
      [null, 'attr', 'wantsAttention'],
      [clsTabHeaderClose, 'node'],
    ],
  },
  {
    roots: clsTab,
    kids: [],
  }
];
const TF_node = 0, TF_label = 1, TF_kind = 2, TF_selected = 3, TF_attention = 4,
      TF_close = 5;

const MODA_NOTIF_GLOBAL_HOOKUP =
  'var callback = arguments[arguments.length - 1]; ' +
  'window.__modaEventTestThunk = function(eventType) {' +
  ' if (eventType === "$EVENT$") callback(); };';

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
function DevUIDriver(T, client, wdloggest, _logger) {
  this._d = wdloggest;

  this._activeTab = null;
  this._currentTabFrob = [];
  this._currentTabKinds = [];
  this._currentTabData = {};

  this._peepBlurbData = {};
  this._connReqData = {};

  this._actor = T.actor('devUIDriver', client.__name, null, this);
  this._log = LOGFAB.devUIDriver(this, _logger, client.__name);

  this._eMakeFriendsBtn = this._eShowPeepsBtn =
    this._eShowConnectRequestsBtn = this._eComposeBtn = null;
}
exports.DevUIDriver = DevUIDriver;
DevUIDriver.prototype = {
  startUI: function() {
    this._d.navigate(UI_URL);

    this._d.waitForModa('whoami');
    this._checkTabDelta({signup: 1, errors: 1}, "signup");
  },

  //////////////////////////////////////////////////////////////////////////////
  // Helpers

  _waitForModa: function(expectedEvent) {
    this._d.waitForRemoteCallback(
      MODA_NOTIF_GLOBAL_HOOKUP.replace('$EVENT$', expectedEvent));
  },

  /**
   * Retrieve the current set of tabs and check it against our previous known
   *  state and the expected set of changes to that state.
   */
  _checkTabDelta: function(tabDelta, currentTab) {
    var self = this, deltaRep = {preAnno: {}, state: {}, postAnno: {}};

    // - mark removed tabs, apply expected deltas
    var idxTab, tabKind, tabKinds = this._currentTabKinds.concat();
    for (tabKind in tabDelta) {
      var change = tabDelta[tabKind];
      // tab closed
      if (change === -1) {
        deltaRep.preAnno[tabKind] = -1;
        idxTab = tabKinds.indexOf(tabKind);
        tabKinds.splice(idxTab, 1);
      }
      // tab added
      else {
        deltaRep.postAnno[tabKind] = 1;
        // insert at the beggining
        if (change === null) {
          tabKinds.splice(0, 0, tabKind);
        }
        // insert after existing tab kind...
        else {
          idxTab = tabKinds.indexOf(change);
          tabKinds.splice(idxTab + 1, 0, tabKind);
        }
      }
    }

    // - generate new tab state, expectation
    for (idxTab = 0; idxTab < tabKinds.length; idxTab++) {
      tabKind = tabKinds[idxTab];
      deltaRep.state[tabKind] = idxTab;
    }
    this._actor.expect_tabState(deltaRep, currentTab);

    when(
      this._d.frobElements(null, TABFROB_DEF),
      function(frobbed) {
        var actualCurrentTab = null,
            deltaRep = { preAnno: {}, state: {}, postAnno: {} },
            realTabKinds = [],
            tabHeaders = frobbed[0], tabBodies = frobbed[1];
        for (var iTab = 0; iTab < tabHeaders.length; iTab++) {
          var tabData = tabHeaders[iTab],
              tabKind = tabData[TF_kind];
          if (tabData[TF_selected])
            actualCurrentTab = self._activeTab = tabKind;
          realTabKinds.push(tabKind);
          this._currentTabData[tabKind] = {
            headerNode: tabData[TF_node],
            closeNode: tabData[TF_close],
            tabNode: tabBodies[iTab][0],
          };
        }

        self._log.tabState(deltaRep, actualCurrentTab);
      });
  },

  /**
   * Explicitly switch tabs, leaving the tab we were on around.
   *
   * XXX speculative
   */
  _switchTab: function(tabKind) {
    this._d.click(this._currentTabData[tabKind].headerNode);
  },

  /**
   * Explicitly close a tab by clicking its close button.
   *
   * Does nothing screenshot-wise, as we do not expect this to be interesting.
   */
  _closeTab: function(tabKind) {
    if (tabKind === undefined)
      tabKind = this._activeTab;
    this._d.click(this._currentTabData[tabKind].closeNode);
  },

  _nukeTabSpawnNewViaHomeTab: function(btnName, tabName) {
    // go to the root tab via close
    if (this._activeTab !== 'home')
      this._closeTab();
    // hit the button to spawn the new tab
    this._d.click(btnName);
    // wait for the tab to populate
    this._waitForModa('query');
    // check the tab is there, etc.
    var tabDelta = {};
    tabDelta[this._activeTab] = -1;
    tabDelta['requests'] = 'home';
    this._checkTabDelta(tabDelta, tabName);
  },

  _verifyPeepBlurbsOnTab: function(tabKind, otherClients) {
    var self = this;
    // - expectation
    var expectedNames = {};
    for (var iClient = 0; iClient < otherClients.length; iClient++) {
      expectedNames[otherClients[iClient]] = null;
    }
    this._actor.expect_visiblePeeps(expectedNames);

    // - grab
    when(
      this._d.frobElements(
        this._currentTabData[tabKind].tabNode,
        {
          roots: clsPeepBlurb,
          data: [
            [clsPeepBlurbName, 'text'],
          ]
        }),
      function gotFrobbedPeepData(results) {
        var actualNames = {},
            allPeepBlurbData = self._peepBlurbData = {};
        for (var iPeep = 0; iPeep < results.length; iPeep++) {
          var peepData = results[iPeep],
              peepName = peepData[1];
          actualNames[peepName] = null;
          allPeepBlurbData[peepName] = peepdata;
        }
        self._log.visiblePeeps(actualNames);
      }
    );
  },

  //////////////////////////////////////////////////////////////////////////////
  // Hacky magic moda things

  /**
   * Force us to connect to the server by marshaling JS code to call the moda
   *  connect function.
   */
  act_connect: function() {
    // XXX actually connect
  },

  //////////////////////////////////////////////////////////////////////////////
  // Signup Mode

  act_signup: function(server) {
    var eSignupTab = this._currentTabData['signup'].tabNode;

    // - name ourselves
    this._d.typeInTextBox({ className: clsPeepBlurbName },
                          client.__name,
                          eSignupTab);

    // - select the server to use
    var domainNameWithPort = server.__url.slice(5, -1);
    this._d.typeInTextBox({ className: clsSignupOtherServer },
                          domainNameWithPort,
                          eSignupTab);

    // - trigger signup
    this._d.click({ className: clsSignupSignup }, eSignupTab);
    // - wait for signup to complete
    this._d.waitForModa('signupResult');
    // the signup tab should have gone away...
    // the signed-up tab should have shown up in the background...
    // the home tab should have shown up, focused
    this._checkTabDelta({ "signed-up": 'signup', home: 'signed-up',
                          signup: -1 },
                        'home');

    this._hookupHomeTab();
  },

  //////////////////////////////////////////////////////////////////////////////
  // Steady-state usage

  _hookupHomeTab: function() {
    var self = this;
    when(
      this._d.frobElements(this._currentTabData['home'].tabNode, {
        roots: clsTabHome,
        data: [
          [clsHomeMakeFriends, 'node'],
          [clsHomeFriendRequests, 'node'],
          [clsHomeListFriends, 'node'],
          [clsHomeCompose, 'node']
        ]
      }),
      function(results) {
        var homeTabData = results[0];
        self._eMakeFriendsBtn = homeTabData[1];
        self._eShowConnectRequestsBtn = homeTabData[2];
        self._eShowPeepsBtn = homeTabData[3];
        self._eComposeBtn = homeTabData[4];
      });
  },

  showPage_possibleFriends: function() {
    this._nukeTabSpawnNewViaHomeTab(this._eMakeFriendsBtn, 'make-friends');
  },

  verify_possibleFriends: function(otherClients) {
    this._verifyPeepBlurbsOnTab('make-friends', otherClients);
  },

  act_issueConnectRequest: function(otherClient) {
    // (we assume that a verify was issued on the listed peeps already)

    // click on the peep blurb
    this._d.click(this._peepBlurbData[otherClient.__name][0]);

    // tab comes up
    this._checkTabDelta({ 'author-contact-request': 'make-friends' },
                        'author-contact-request');

    // click the send request
    this._d.click({ className: clsAuthorConnSend },
                  this._currentTabData['author-contact-request'].tabNode);

    // tab goes away
    this._checkTabDelta({ 'author-contact-request': -1 },
                        'make-friends');
  },

  showPage_peeps: function() {
    this._nukeTabSpawnNewViaHomeTab(this._eShowPeepsBtn, 'peeps');
  },

  /**
   * Verify all provided clients are present *in no particular order*.
   */
  verify_peeps: function(otherClients) {
    this._verifyPeepBlurbsOnTab('peeps', otherClients);
  },

  showPage_connectRequests: function() {
    this._nukeTabSpawnNewViaHomeTab(this._eMakeFriendsBtn, 'requests');
  },

  /**
   * Verify all connection requests are present *in no particular order*.
   */
  verify_connectRequests: function(connReqTuples) {
    var self = this;
    // - expectation
    var expectedNamesAndMessages = {};
    for (var iReq = 0; iReq < connReqTuples.length; iReq++) {
      var requesterName = connReqTuples[iReq][0],
          requestMessage = connReqTuples[iReq][1];
      expectedNamesAndMessages[requesterName] = requestMessage;
    }
    this._actor.expect_visibleConnReqs(expectedNamesAndMessages);

    // - actual
    when(
      this._d.frobElements(
        this._currentTabData['requests'].tabNode,
        {
          roots: clssConnReqRoot,
          data: [
            // XXX we don't actually check the involved peeps right now
            {
              roots: clsPeepInlineRoot,
              data: [
                [clsPeepInlineName, 'text'],
              ],
            },
            [clsConnReqName, 'text'],
            [clsConnReqMessage, 'text'],
          ]
        }
      ),
      function(results) {
        var actualNamesAndMesages = {},
            allConnReqData = self._connReqData = {};
        for (var iReq = 0; iReq < results.length; iReq++) {
          var requesterName = results[iReq][2],
              requestMessage = results[iReq][3];
          actualNamesAndMesages[requesterName] = requestMessage;
          allConnReqData[requesterName] = results[iReq];
        }
        self._log.visibleConnReqs(actualNamesAndMesages);
      });
  },

  act_approveConnectRequest: function(otherClient) {
    // (we assume that a verify was issued on the conn reqs already)

    // click on the connection request
    this._d.click(this._connReqData[otherClient.__name][0]);

    // this should pop up a new tab with details immediately (no queries)
    this._checkTabDelta({ 'accept-request': 'requests' },
                        'accept-request');

    // confirm the connection
    this._d.click({ className: clsAcceptConnAccept },
                  this._currentTabData['accept-request'].tabNode);

    // tab goes away!
    this._checkTabDelta({ 'accept-request': -1 },
                        'requests');
  },


  showPage_peepConversations: function(otherClient) {
    // (we assume that we are already on the 'peeps' tab/list)

    // click on the peep blurb
    this._d.click(this._peepBlurbData[otherClient.__name][0]);

    // the conversations tab should come up and populate
    this._waitForModa('query');

    // kill the peeps tab
    this._closeTab('peeps');

    // verify tab status
    this._checkTabDelta({ conversation: 'peeps', peeps: -1 },
                        'conversation');
  },

  /**
   * Verify all conversations are present *in no particular order*.
   */
  verify_conversations: function(tConvs) {
    var self = this, expectedFirstMessages = {};
    // - expectation
    for (var iConv = 0; iConv < tConvs.length; iConv++) {
      expectedFirstMessages[tConvs[iConv].data.firstMessage.data.text] = null;
    }
    this._actor.expect_visibleConvs(expectedFirstMessages);

    // - actual
    when(
      this._d.frobElements(
        this._currentTabData['conversation'].tabNode,
        {
          roots: clsConvBlurb,
          data: [
            [clsConvBlurbText, 'text'],
          ]
        }
      ),
      function(results) {
        var actualFirstMessages = {};
        for (var iConv = 0; iConv < results.length; iConv++) {
          actualFirstMessages[results[iConv][1]] = null;
        }
        self._log.visibleConvs(actualFirstMessages);
      });
  },

  act_showConversation: function() {
    // XXX implement
  },

  act_replyToConversation: function() {
    // XXX implement
  },

  act_inviteToConversation: function() {
    // XXX implement
  },

  /**
   * Create a conversation from the home tab.  The alternative would be to
   *  create a conversation from a peep conversation list where we automatically
   *  add that peep to the list of invited peeps.
   */
  act_createConversation: function(recipClients, messageText) {
    var self = this;

    // hit the create a conversation button
    this._nukeTabSpawnNewViaHomeTab(this._eComposeBtn, 'conv-compose');

    // - add the peep(s)
    function findAndClickPeepInPopup(client) {
      when(
        self._d.frobElements(
          [self._currentTabData['conv-compose'].tabNode, clsPeepPopPeeps],
          {
            roots: clsPeepBlurb,
            data: [
              [clsPeepBlurbName, 'text'],
            ],
          }),
        function(frobbed) {
          for (var iPeep = 0; iPeep < frobbed.length; iPeep++) {
            if (frobbed[iPeep][1] === client.__name) {
              self._d.click(frobbed[iPeep][0]);
              return;
            }
          }
        });
    }

    function verifyPeepInComposeList(client) {
      when(
        self._d.frobElements(
          [self._currentTabData['conv-compose'].tabNode, clsComposePeepsList],
          {
            roots: clsPeepInlineRoot,
            data: [
              [clsPeepInlineName, 'text'],
            ],
          }),
        function(frobbed) {
          for (var iPeep = 0; iPeep < frobbed.length; iPeep++) {
            if (frobbed[iPeep][1] === client.__name) {
              return;
            }
          }
          self._log.peepNotAdded(client.__name);
        });
    }

    for (var iRecip = 0; iRecip < recipClients.length; iRecip++) {
      var recip = recipClients[iRecip];
      // hit add to show the popup of people we can add
      this._d.click({ className: clsComposeAddPeep });
      // click the peep
      findAndClickPeepInPopup(recip);
      // verify the peep showed up
      verifyPeepInComposeList(recip);
    }

    // - type in the message
    this._d.typeInTextBox({ className: clsComposeText },
                          messageText,
                          this._currentTabData['conv-compose'].tabNode);

    // - hit send
    this._d.click({ className: clsComposeSend },
                  this._currentTabData['conv-compose'].tabNode);

    // - make sure the tab goes away
    this._checkTabDelta({ 'conv-compose': -1 }, 'home');

    // (we expect the caller to bring up the list of converations themselves
    //  subsequent to this and verify the list of conversations includes the
    //  new conversation.)
  },

  //////////////////////////////////////////////////////////////////////////////
};

var LOGFAB = exports.LOGFAB = $log.register($module, {
  devUIDriver: {
    // we are a client/server client, even if we are smart for one
    type: $log.TEST_SYNTHETIC_ACTOR,
    subtype: $log.CLIENT,

    events: {
      tabDelta: { state: true, activeTab: true },
      visiblePeeps: { names: true },
      visibleConnReqs: { namesAndMessages: true },
      visibleConvs: { firstMessages: true },
    },
    TEST_ONLY_events: {
    },

    errors: {
      peepNotAdded: { name: false },
    },
  },
});

}); // end define
