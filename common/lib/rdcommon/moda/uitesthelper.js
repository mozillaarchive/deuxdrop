/****** BEGIN LICENSE BLOCK *****
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
 *
 * ## Fiddly Bits ##
 *
 * We run into a new testing complication here in terms of getting at the keys
 *  and nonces created as part of the conversation creation.  For testClient
 *  we have the results available to us directly from our call.  For moda our
 *  testwrapper that we use to break up steps also exposes the result of a
 *  call to us (with some collusion on the moda backside).
 *
 * There are basically two types of information we need from the creation info:
 * - Naming info for our 'thing' representations, allowing us to alias the
 *    nonces and keys as well as generate expectations against them.
 * - Full participant `ConvMeta` representation info for the raw testClient
 *    testers.
 *
 * The options for getting the required data are:
 * - Have the selenium driver also open a privileged URL that we allow to
 *    extract the data, but without letting the Moda Bridge API be able to
 *    do the same thing, so that we don't give the UI page any dangerous
 *    privileges it wouldn't otherwise need.
 * - For the `ConvMeta` data, have any testClient recipients provide the data
 *    when they get invited to the conversation.  If none are added, the data
 *    will never be needed.
 * - Extract the naming information out of the `CreateConversationTask` on the
 *    fanout server.  Use the actor hookup to be able to steal things out of
 *    the instance.
 *
 * We are using a combination of the 2nd and 3rd options.  The privileged URL
 *  adds a test-only moving part we don't really need or want at this time.
 *
 * ## Future Potential ##
 *
 * We could force the loggers in the UI instance into full-logging mode and
 *  extract the information at the end of every test step if needed.  It is
 *  within our power to extend the expectation mechanism all the way into
 *  the innards of the 'daemon client' so we could run full unit test logic,
 *  but we avoid doing that because that we would like to be able to do some
 *  realistic performance timing in this mode of testing.
 **/

define(function(require, exports, $module) {

var $Q = require('q'),
    when = $Q.when;

var $testdata = require('rdcommon/testdatafab'),
    $log = require('rdcommon/log');

var $wdloggest = require('rduidriver/wdloggest'),
    $devui_driver = require('rduidriver/devui'),
    $th_servers = require('rdservers/testhelper'),
    $th_moda = require('rdcommon/moda/testhelper');

var TestClientActorMixins = $th_servers.TestClientActorMixins,
    TestModaActorMixins = $th_moda.TestModaActorMixins;

var $pubring = require('rdcommon/crypto/pubring');

var fakeDataMaker = $testdata.gimmeSingletonFakeDataMaker();

/**
 * Expect *only the server side* authconn bit of an authenticated connection
 *  because we are talking about the UI and we can't see what's happening
 *  inside the client (as things are currently implemented).
 */
function expectAuthconnFromTo(source, target, endpoint) {
  // nothing to do in self case.
  if (source === target)
    return;
  var eServerConn = target.T.actor('serverConn',
                                 target.__name + ' ' + endpoint, null,
                                 target);
  target.RT.reportActiveActorThisStep(eServerConn);
  eServerConn.expectOnly__die();
};

function DummyTestClient(owningUiTester, name, RT, T) {
  this.uiTester = owningUiTester;

  // - actor bits
  this.__name = name;
  // masqeurade as our owner for actor name-check purposes
  this._uniqueName = owningUiTester._uniqueName;
  this.RT = RT;
  this.T = T;

  // - testClient bits
  this._connected = false;
  this._usingServer = null;
  // we want the moda notifications
  this._modaActors = [this];

  this._allClones = [this];

  this._staticModaActors = [this];
  // we leave this null because we should not be writing to or reading from
  //  this; it's a hack to make it easier for testClient generation of
  //  converastion actions.
  this._peepsByName = null;

  this._staticConnReqReceived = {};

  this._eServerConn = null;

  // - testModa representation bits
  this._testClient = this; // hopefully just used for the client's name
  // (moda helper instances get their own name, like mA while the client is A)

  this._dynamicContacts = [];
  this._dynamicContactInfos = [];
  this._contactMetaInfoByName = {};
  this._dynamicConvInfos = [];
  this._convInfoByName = {};
  this._dynConnReqInfos = [];
  this._dynPendingConvMsgs = [];

  // - testModa live queries that we never populate
  // We don't use the ability to know about deltas; we just issue new full
  //  checks every time.  So we can leave these empty, but iteration logic
  //  really needs them to exist.
  this._dynamicPeepQueries = [];
  this._dynamicConvBlurbQueries = [];
  this._dynamicConvMsgsQueries = [];
  this._dynPendingQueries = [];
  this._dynamicPossFriendsQueries = [];
  this._dynamicConnReqQueries = [];
  this._dynamicServerQueries = [];

  // - hacked state tracking
  // we lack an expectation representation for this, so we have to save off
  //  the explicit payloads given to us.
  this._dynPossibleFriendClients = null;
}
DummyTestClient.prototype = {
  toString: function() {
    return '[DummyTestClient ' + this.__name + ']';
  },

  //////////////////////////////////////////////////////////////////////////////
  // moda fakeness hookups

  createFakeSelfContactInfo: function() {
    var nowSeq = this.RT.testDomainSeq;
    this._contactMetaInfoByName[this.__name] = {
      isUs: true,
      rootKey: this.rootPublicKey,
      name: this.__name,
      involvedConvs: [],
      any: nowSeq,
      write: nowSeq,
      recip: nowSeq,
    };
  },

  //////////////////////////////////////////////////////////////////////////////
  // Pretend to be an actor
  //
  // So we can be name-checked by test steps.  We don't actually allow
  //  expectations to be issued against us, so we always return success results.

  __prepForTestStep: function() {},
  __waitForExpectations: function() {
    // yes, we are very happy!
    return true;
  },
  __resetExpectations: function() {
    // oh, so happy!
    return true;
  },
  __failUnmetExpectations: function() {},


  //////////////////////////////////////////////////////////////////////////////
  // Parameterized Step Support

  _parameterizedSteps: TestClientActorMixins._parameterizedSteps,
  _T_allClientsStep: TestClientActorMixins._T_allClientsStep,
  _T_connectedClientsStep: TestClientActorMixins._T_connectedClientsStep,
  _T_otherClientsStep: TestClientActorMixins._T_otherClientsStep,
  _dohelp_closesConnReqLoop: TestClientActorMixins._dohelp_closesConnReqLoop,

  //////////////////////////////////////////////////////////////////////////////
  // testClient helper methods relevant to us

  _dynamicNotifyModaActors: TestClientActorMixins._dynamicNotifyModaActors,

  _expect_contactRequest_prep:
    TestClientActorMixins._expect_contactRequest_prep,
  _expdo_openContactRequest:
    TestClientActorMixins._expdo_openContactRequest,
  _expdo_closeContactRequest:
    TestClientActorMixins._expdo_closeContactRequest,
  _expdo_contactRequest_everything_else:
    TestClientActorMixins._expdo_contactRequest_everything_else,

  _expect_createConversation_rawclient_to_server:
    TestClientActorMixins._expect_createConversation_rawclient_to_server,
  _expdo_createConversation_fanout_onwards:
    TestClientActorMixins._expdo_createConversation_fanout_onwards,

  _expect_replyToConversation_rawclient_to_server:
    TestClientActorMixins._expect_replyToConversation_rawclient_to_server,
  _expdo_replyToConversation_fanout_onwards:
    TestClientActorMixins._expdo_replyToConversation_fanout_onwards,

  do_expectConvWelcome:
    TestClientActorMixins.do_expectConvWelcome,

  expectServerTaskToRunOnOwnersBehalf:
    TestClientActorMixins.expectServerTaskToRunOnOwnersBehalf,

  //////////////////////////////////////////////////////////////////////////////
  // Notifications from testClient

  __receiveConnectRequest: TestModaActorMixins.__receiveConnectRequest,
  __requestContact: TestModaActorMixins.__requestContact,
  __addingContact: TestModaActorMixins.__addingContact,
  __rejectContact: TestModaActorMixins.__rejectContact,
  __receiveConvWelcome: TestModaActorMixins.__receiveConvWelcome,
  __receiveConvMessage: TestModaActorMixins.__receiveConvMessage,
  __updatePhaseComplete: TestModaActorMixins.__updatePhaseComplete,

  //////////////////////////////////////////////////////////////////////////////
  // Live-UI checking logic

  _notifyConnectRequestIssued: function(testClient) {
    var expectedClients = this._dynPossibleFriendClients;
    if (!expectedClients)
      return;

    var idxIssued = expectedClients.indexOf(testClient);
    if (idxIssued === -1)
      return;

    expectedClients.splice(idxIssued, 1);

    if (this.uiTester._uid.canSee_possibleFriends())
      this.uiTester._verifyPossibleFriends(expectedClients, true);
  },

  _notifyConnectRequestReceived: function(reqInfo) {
    if (this.uiTester._uid.canSee_connectRequests())
      this.uiTester._verifyConnectRequests(true);
  },
  _notifyConnectRequestMooted: function(name) {
    if (this.uiTester._uid.canSee_connectRequests())
      this.uiTester._verifyConnectRequests(true);
  },

  _notifyPeepAdded: function(newCinfo) {
    if (this.uiTester._uid.canSee_peeps())
      this.uiTester._verifyPeeps(true);
  },
  _notifyPeepChanged: function(cinfo, knownChange) {
    if (this.uiTester._uid.canSee_peeps())
      this.uiTester._verifyPeeps(true);
  },
  _notifyPeepConvTimestampsChanged: function(cinfo, convIndicies, convInfo,
                                             joinOccurred) {
    // XXX we don't care about ordering changes right now
  },
  _notifyConvGainedMessages: function(convInfo) {
    if (this.uiTester._uid.canSee_conversation(convInfo))
      this.uiTester._verifySingleConversation(convInfo, true);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Contacts

  _recip_expect_openContactRequest: function(senderClient, messageText) {
    // update our moda-ish rep
    this.__receiveConnectRequest(senderClient, messageText);
  },
  _recip_expect_closeContactRequest: function(otherClient) {
    this.__addingContact(otherClient);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Conversations

  _recip_expect_convWelcome: function() {}

  //////////////////////////////////////////////////////////////////////////////
};


var TestUIActorMixins = {
  __constructor: function(self, opts) {
    // - create a faux testClient for identification/hookup purposes.
    self.client = new DummyTestClient(self, self.__name, self.RT, self.T);

    // - spawn ui instance and attach
    var bigStep =self.T.convenienceSetup(self, 'creates webdriver', function() {
      self.__attachToLogger(LOGFAB.testUI(self, null, self.__name));

      self._lwd = new $wdloggest.LoggestWebDriver(
                    self.client.__name, self.RT, self.T, self._log);
      self._uid = new $devui_driver.DevUIDriver(self.RT, self.T, self.client,
                                                self._lwd, self._log);
      when(self._uid.startUI(),
        function(identityInfo) {
          var pubring = $pubring.createPersonPubringFromSelfIdentDO_NOT_VERIFY(
                          identityInfo.selfIdentBlob);

          self.client.selfIdentBlob = identityInfo.selfIdentBlob;
          self.client.rootPublicKey = pubring.rootPublicKey;
          self.client.tellBoxKey =
            pubring.getPublicKeyFor('messaging', 'tellBox');

          self.T.ownedThing(self, 'key', self.__name + ' root',
                            pubring.rootPublicKey);
          self.T.ownedThing(self, 'key', self.__name + ' longterm',
                            pubring.allLongtermSigningKeys[0]);
          self.T.ownedThing(self, 'key', self.__name + ' tell',
                            self.client.tellBoxKey);

          self.T.ownedThing(self, 'key', self.__name + ' client',
                            identityInfo.clientPublicKey);

          // - finalize fake moda rep hookup
          self.client.createFakeSelfContactInfo();
        });
    });
    // unfortunately, firefox can take some time to start up.
    bigStep.timeoutMS = 10000;
  },

  //////////////////////////////////////////////////////////////////////////////
  // Setup

  /**
   * Run the signup process to completion for the given server.
   */
  setup_useServer: function(server) {
    var self = this;
    this.client._usingServer = server;
    this.T.convenienceSetup(self, 'creates account with', server._eServer,
                            function() {
      // expect the signup connection in the server
      expectAuthconnFromTo(self, server, 'signup.deuxdrop');
      // trigger the signup on the client and wait for the client to claim
      //  the signup process completed
      when(self._uid.act_signup(server, self.__name),
           function(identityInfo) {
        // the self ident blob has changed; we need to update it
        self.client.selfIdentBlob = identityInfo.selfIdentBlob;
      });
    });
  },

  /**
   * Force the UI to connect to its server.
   */
  setup_connect: function() {
    var self = this;
    this.client._connected = true;
    this.T.convenienceSetup(self, 'connects to server',
                            this.client._usingServer._eServer, function() {
      // expect the server side of the mailstore connection establishment
      self.client._usingServer._expect_mailstoreConnection(self.client);
      // trigger the connect, wait for the UI to report connection success
      self._uid.act_connect();
    });
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
    this.T.action('show possible friends page', function() {
      self.client._dynPossibleFriendClients = otherClients;
      self._uid.showPage_possibleFriends();
    });
    this.T.check('verify possible friends', function() {
      self._verifyPossibleFriends(otherClients);
    });
  },

  _verifyPossibleFriends: function(otherClients, waitForUpdate) {
    this._uid.verify_possibleFriends(otherClients, waitForUpdate);
  },

  /**
   * Initiate a connect request to the given peep, operating under the
   *  assumption that the current UI page is showing us this peep somewhere.
   *  If the UI shows a confirmation page with details, this automatically
   *  completes the connection process from that page.
   */
  do_connectToPeep: function(otherClient, interesting) {
    var messageText = 'Friend Me Because... ' + fakeDataMaker.makeSubject(),
        closesLoop = this.client._dohelp_closesConnReqLoop(otherClient),
        self = this;

    this.T.action(this, 'begin requesting contact of', otherClient, function() {
      self._uid.act_beginIssuingConnectRequest(otherClient);
    });
    this.T.action(this, 'finish requesting contact of', otherClient, function(){
      self.client._expect_contactRequest_prep(otherClient, closesLoop);

      self._uid.act_finishIssuingConnectRequest(otherClient);
    });
    this.client._expdo_contactRequest_everything_else(otherClient, messageText,
                                                      interesting);
  },

  _verifyConnectRequests: function(waitForUpdate) {
    this._uid.verify_connectRequests(this.client._dynConnReqInfos,
                                     waitForUpdate);
  },

  /**
   * Bring up the list of unhandled, received connection requests.
   */
  do_showConnectRequests: function() {
    var self = this;
    this.T.action(this, 'shows connect requests page', function() {
      self._uid.showPage_connectRequests();
    });
    this.T.check(this, 'verify connect requests', function() {
      self._verifyConnectRequests();
    });
  },

  /**
   * Select and approve a connection request from the given client.  This should
   *  be used when do_showConnectRequests is in effect.
   */
  do_approveConnectRequest: function(otherClient) {
    var self = this;
    this.T.action(this, 'begin approving connect request from', otherClient,
                  function() {
      self._uid.act_beginApprovingConnectRequest(otherClient);
    });
    this.T.action(this, 'finish approving connect request from', otherClient,
                  function() {
      self.client._expect_contactRequest_prep(otherClient, true);
      self._uid.act_finishApprovingConnectRequest(otherClient);
    });
    this.client._expdo_contactRequest_everything_else(otherClient, null);
  },

  _verifyPeeps: function(waitForUpdate) {
    this._uid.verify_peeps(this.client._dynamicContacts, waitForUpdate);
  },

  /**
   * Bring up the list of connected contacts and verify that all our connected
   *  peeps are listed.
   */
  do_showPeeps: function() {
    var self = this;
    this.T.action(this, 'show peeps page', function() {
      self._uid.showPage_peeps();
    });
    this.T.check(this, 'verify peeps page', function() {
      self._verifyPeeps();
    });
  },

  //////////////////////////////////////////////////////////////////////////////
  // Conversation browsing

  /**
   * Bring up a list of conversations involving the peep associated with the
   *  given client.
   */
  do_showPeepConversations: function(otherClient) {
    var self = this, cinfo;
    this.T.action(this, 'show conversations with', otherClient, function() {
      cinfo = self.client._contactMetaInfoByName[otherClient.__name];
      self._uid.showPage_peepConversations(otherClient);
    });
    this.T.check(this, 'verify conversations with', otherClient, function() {
      self._uid.verify_conversations(cinfo.involvedConvs);
    });
  },

  _verifySingleConversation: function(convInfo, waitForUpdate) {
    this._uid.verify_singleConversation(convInfo, waitForUpdate);
  },

  /**
   * Display a conversation that is already visible thanks to a call to
   *  `do_showPeepConversations`.
   */
  do_openPeepConversation: function(tConv) {
    var self = this, convInfo;
    this.T.action(this, 'open conversation', tConv, function() {
      convInfo = self._convInfoByName[tConv.__name];
      self._uid.act_showConversation(convInfo);
    });
    this.T.check(this, 'verify conversation', tConv, function() {
      self._verifySingleConversation(convInfo);
    });
  },

  //////////////////////////////////////////////////////////////////////////////
  // Conversation manipulation

  /**
   * Create a conversation with the given set of initial recipients.  It's up to
   *  the UI how it does this.
   *
   */
  do_createConversation: function(tConv, tNewMsg, recipClients) {
    var self = this, messageText,
        youAndMeBoth = [self.client].concat(recipClients);
    tConv.sdata = {
      participants: youAndMeBoth.concat(),
      fanoutServer: this.client._usingServer,
    };

    this.T.action(this, 'brings up compose page', function() {
      self._uid.showPage_compose();
    });
    this.T.action(this, 'creates conversation', function() {
      // - server expectation and hold fanout processing
      var eServer = self.client._usingServer;
      eServer.holdAllMailSenderMessages();
      eServer.expectPSMessageToUsFrom(self.client);

      // - create the conversation
      messageText = fakeDataMaker.makeSubject();
      // create fake conversation creation info; we'll fix things up when the
      //  fanout server gets to process this conversation.
      var fakeConvCreationInfo = {
        convId: null,
        msgNonce: null,
        convMeta: null,
        joinNonces: youAndMeBoth.map(function() { return null; }),
      };
      self.client._expect_createConversation_rawclient_to_server(
                    fakeConvCreationInfo, messageText, youAndMeBoth,
                    tConv, tNewMsg);

      self._uid.act_createConversation(recipClients, messageText);
    });
    // and here we provide a function that gets a peek at the contents of the
    //  `CreateConversationTask`'s instance at creation time to grab all the
    //  data about the conversation out that we need for the test except the
    //  `ConvMeta` data potentially needed by `testClient` instances.  If a
    //  `testClient` instance is in the loop, it will handle that itself;
    //  see
    this.client._expdo_createConversation_fanout_onwards(tConv,
      function(event, task) {
        if (event !== 'attach')
          return;

        tConv.digitalName = tConv.data.id = task.innerEnvelope.convId;

        var convPayload = task.innerEnvelope.payload,
            addPayloads = convPayload.addPayloads;
        for (var iAdd = 0; iAdd < addPayloads.length; iAdd++) {
          var addPayload = addPayloads[iAdd];
          // we are (correctly) assuming that the order exactly matches here
          //  between youAndMeBoth and the joins lines up exactly.
          var tJoin = tConv.data.backlog[iAdd];
          tJoin.digitalName = addPayload.attestationNonce;
        }

        tNewMsg.digitalName = convPayload.msgNonce;
      });
  },

  /**
   * Reply to the existing and currently displayed conversation.  The UI should
   *  use an affordance on the conversation display.
   */
  do_replyToConversationWith: function(tConv, tNewMsg) {
    var self = this, messageText;
    this.T.action(this, 'replies to conversation', function() {
      messageText = fakeDataMaker.makeSubject();

      var eServer = self.client._usingServer;
      eServer.holdAllMailSenderMessages();
      eServer.expectPSMessageToServerFrom(tConv.sdata.fanoutServer,
                                          self.client);

      // provide a fake nonce, fix it up with a snipe
      self.client._expect_replyToConversation_rawclient_to_server(
        tConv, tNewMsg, {msgNonce: null}, messageText);

      self._uid.act_replyToConversation(messageText);
    });
    // snipe the message nonce out when the fanout server gets things
    this.client._expdo_replyToConversation_fanout_onwards(tConv, tNewMsg,
      function(event, task) {
        if (event !== 'attach')
          return;

        tNewMsg.digitalName = task.outerEnvelope.nonce;
      });
  },

  /**
   * Invite a client to the existing and currently displayed conversation.
   */
  do_inviteToConversation: function(invitedClient, tConv) {
    // XXX this is not a thing that can happen yet; fix the UI, etc.
  },

  //////////////////////////////////////////////////////////////////////////////
};

var LOGFAB = exports.LOGFAB = $log.register($module, {
  testUI: {
    // we are a client/server client, even if we are smart for one
    type: $log.TEST_SYNTHETIC_ACTOR,
    subtype: $log.CLIENT,
    topBilling: true,

    events: {
    },
    TEST_ONLY_events: {
    },
  },
});


exports.TESTHELPER = {
  // we should always be used with th_rdservers and th_moda, so we only need
  //  to cover the ui driver bits
  LOGFAB_DEPS: [LOGFAB,
    $devui_driver.LOGFAB, $wdloggest.LOGFAB,
  ],

  actorMixins: {
    testUI: TestUIActorMixins,
  },
};

}); // end define
