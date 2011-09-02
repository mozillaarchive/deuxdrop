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
 * Provides test helper abstractions for client and server behaviours, providing
 *  helper methods that both trigger actions and verify the resulting state.
 *  The goal is to minimize the amount of boilerplate in the unit tests;
 *  experience from Thunderbird has shown people will tend to just copy and
 *  paste test logic without spending a lot of time trying to understand it so
 *  it's better for all involved if we minimize that code and build-in all the
 *  relevant checks so they don't accidentally get left out.
 *
 * In concrete terms, this means that when you create a conversation (named
 *  as a "thing"), we do things like store all the participants in the
 *  conversation on the object so that then when a message is sent to the
 *  conversation we can automatically generate expectations for its arrival
 *  at all of the relevant servers.  Likewise, we track whether a client is
 *  connected so we can know whether we should expect the message to make it
 *  to the client, or if it instead should be backlogged.
 **/

define(function(require,exports,$module) {

var $Q = require('q'),
    when = $Q.when;

var $testdata = require('rdcommon/testdatafab');

var $log = require('rdcommon/log'),
    $authconn = require('rdcommon/transport/authconn'),
    $keyring = require('rdcommon/crypto/keyring'),
    $pubring = require('rdcommon/crypto/pubring'),
    $pubident = require('rdcommon/identities/pubident');

var $gendb = require('rdplat/gendb'),
    $configurer = require('rdservers/configurer');

var $signup_server = require('rdservers/signup/server'),
    $maildrop_server = require('rdservers/maildrop/server'),
    $mailstore_uproc = require('rdservers/mailstore/uproc'),
    $mailsender_local_api = require('rdservers/mailsender/localapi');

var $rawclient_api = require('rdcommon/rawclient/api'),
    $client_schema = require('rdcommon/rawclient/schema'),
    $client_localdb = require('rdcommon/rawclient/localdb'),
    $client_notif = require('rdcommon/rawclient/notifking'),
    $client_tasks = require('rdcommon/rawclient/lstasks');


var $testwrap_sender = require('rdservers/mailsender/testwrappers'),
    // the mailstore is not wrapping an API so does not go in the clobber ns.
    $testwrap_mailstore = require('rdservers/mailstore/testwrappers');

var gClobberNamespace = {
  senderApi: $testwrap_sender,
};

var fakeDataMaker = $testdata.gimmeSingletonFakeDataMaker();

function expectAuthconnFromTo(source, target, endpoint) {
  // nothing to do in self case.
  if (source === target)
    return;
  var eClientConn = source.T.actor('clientConn',
                                 source.__name + ' ' + endpoint, null,
                                 source),
      eServerConn = target.T.actor('serverConn',
                                 target.__name + ' ' + endpoint, null,
                                 target);
  source.RT.reportActiveActorThisStep(eClientConn);
  eClientConn.expectOnly__die();
  target.RT.reportActiveActorThisStep(eServerConn);
  eServerConn.expectOnly__die();
};


var TestClientActorMixins = {
  /**
   * Automatically create an identity; a client is not much use without one.
   *  (In the future we may look at the argument bundle provided to the actor
   *  instantiation in order to use an existing one too.)
   *
   * @args[
   *   @param[self]
   *   @param[opts @dict[
   *     @key[clone #:optional TestClient]{
   *       Have this new test client be another client for the same imagined
   *       user of the other client.  Make sure both clients know about each
   *       other and accordingly signups do the right thing.
   *
   *       This linkage is established before any tests are run.
   *     }
   *   ]]
   * ]
   */
  __constructor: function(self, opts) {
    // -- define the raw client and its setup step
    self._eRawClient = self.T.actor('rawClient', self.__name, null, self);
    self._eLocalStore = self.T.actor('localStore', self.__name, null, self);
    // We don't create the actors for both sides of our connection until we
    //  connect. These may need to be refreshed, too.
    self._eClientConn = null;
    self._eServerConn = null;

    if (opts && opts.clone) {
      self._allClones = opts.clone._allClones;
      self._allClones.push(self);
    }
    else {
      self._allClones = [self];
    }
    /** static connection indication; get dynamic indication off the client */
    self._connected = false;

    /** Dynamic list of known moda actors. */
    self._modaActors = [];
    /** Setup-time list of known moda actors. */
    self._staticModaActors = [];

    /**
     * @field[@dictof[name OtherPersonIdentBlob]]{
     *   Dynamic (only known/updated during steps) known peeps map.
     * }
     */
    self._peepsByName = {};
    self.T.convenienceSetup(self._eRawClient, 'creates identity',
        function() {
      // tell it about all the actors that will be instantiated this turn...
      self.RT.reportActiveActorThisStep(self._eLocalStore);

      // - create our self-corresponding logger the manual way
      // (we deferred until this point so we could nest in the hierarchy
      //  in a traditional fashion.)
      self._logger = LOGFAB.testClient(self, null, self.__name);
      self._logger._actor = self;

      self._db = $gendb.makeTestDBConnection(self.__name, self._logger);

      // -- CLONE!
      if (opts && opts.clone) {
        // - fork an identity with a new client keypair
        self._rawClient = $rawclient_api.getClientForExistingIdentity(
            opts.clone._rawClient.__forkNewPersistedIdentityForNewClient(),
            self._db,
            self._logger);
        // (This leaves the thing we are cloning knowing about us, and we know
        //  about it.  But this is a pairwise thing so any other clones should
        //  also fork off of the same guy as us, leaving only that one guy
        //  knowing about all us clones!)
      }
      // -- FIRST / ONLY!
      else {
        // - create the client with a new identity
        var poco = {
          displayName: self.__name,
        };
        self._rawClient = $rawclient_api.makeClientForNewIdentity(poco,
                                                                  self._db,
                                                                  self._logger);

        // - bind names to our public keys (so the logs are less gibberish)
        self.T.ownedThing(self, 'key', self.__name + ' root',
                          self._rawClient.rootPublicKey);
        self.T.ownedThing(self, 'key', self.__name + ' longterm',
                          self._rawClient.longtermSigningPublicKey);

        self.T.ownedThing(self, 'key', self.__name + ' tell',
                          self._rawClient.tellBoxKey);
      }

      self.T.ownedThing(self, 'key', self.__name + ' client',
                        self._rawClient.clientPublicKey);
    });
  },

  //////////////////////////////////////////////////////////////////////////////
  // Helpers: Multiple Client

  _parameterizedSteps: function(stepMethod, stepArgs, paramInstances) {
    // scan and find the '*PARAM*' index
    var iArg;
    for (iArg = 0; iArg < stepArgs.length; iArg++) {
      if (stepArgs[iArg] === '*PARAM*')
        break;
    }
    if (iArg === stepArgs.length)
      throw new Error("Bad parameterizedSteps argument; missing *PARAM*");
    var iFunc = stepArgs.length - 1, stepFunc = stepArgs[iFunc];

    for (var iParamInst = 0; iParamInst < paramInstances.length; iParamInst++) {
      var param = paramInstances[iParamInst];
      stepArgs[iArg] = param;
      stepArgs[iFunc] = stepFunc.bind(null, param);
      this.T[stepMethod].apply(this.T, stepArgs);
    }
  },

  /**
   * Define a step that should be invoked once per associated client.  This
   *  should be used for handling notifications that originated elsewhere and so
   *  all clients are equally interested.
   */
  _T_allClientsStep: function() {
    this._parameterizedSteps('action', arguments, this._allClones);
  },

  /**
   * Define a step that should be invoked once per connected/associated client.
   */
  _T_connectedClientsStep: function() {
    var connectedClients = this._allClones.filter(function(client) {
                                                    return client._connected;
                                                  });
    this._parameterizedSteps('action', arguments, connectedClients);
  },

  /**
   * Define a step that should be invoked once per associated client that is not
   *  this client.  This should be used for handling things that other clients
   *  hear about via replicated blocks played at them.
   */
  _T_otherClientsStep: function() {
    var self = this;
    var otherClients = this._allClones.filter(function(client) {
                                                return client !== self;
                                              });
    this._parameterizedSteps('action', arguments, connectedClients);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Helpers: Moda Bridges
  _dynamicNotifyModaActors: function(what, data1, data2) {
    var methodName = '__' + what;
    for (var i = 0; i < this._modaActors.length; i++) {
      var modaActor = this._modaActors[i];
      modaActor[methodName].call(modaActor, data1, data2);
    }
  },

  //////////////////////////////////////////////////////////////////////////////
  // Server Accounts

  /**
   * Perform a signup with the given server.  This is marked private because
   *  we really need to know `_usingServer` during the step definition for
   *  many of other helpers, so we really want test code to call our
   *  `setup_useServer` function instead since it runs at step definition time.
   */
  _signupWith: function(testServerActor) {
    expectAuthconnFromTo(this, testServerActor, 'signup/signup');

    // expect
    this.RT.reportActiveActorThisStep(this._eRawClient);
    this._eRawClient
      .expect_signup_begin()
      .expect_signedUp()
      .expect_signup_end();

    this._rawClient.signupUsingServerSelfIdent(
      this._usingServer.__signedSelfIdentBlob);
  },

  setup_useServer: function setup_useServer(server) {
    this._usingServer = server;
    var self = this;
    return this.T.convenienceSetup(self._eRawClient, 'creates account with',
                                   server._eServer,
                                   function() {

      self._signupWith(server);
    });
  },


  setup_assumeUsingServer: function(testServerActor) {
    this._usingServer = testServerActor;
    var self = this;
    return this.T.convenienceSetup(this._eRawClient, 'assumes account with',
                                   testServerActor._eServer, function() {
      self._rawClient.useServerAssumeAlreadySignedUp(
        self._usingServer.__signedSelfIdentBlob);
    });
  },

  //////////////////////////////////////////////////////////////////////////////
  // Mailstore Connection

  /**
   * Connect to the mailstore, expecting the connection to succeed and
   *  deviceCheckin to complete including all replica data to be received.
   */
  connect: function() {
    // create the actors for our mailstore connections and report them pending
    this._eClientConn = this.T.actor('clientConn', this.__name + ' mailstore',
                                     null, this);
    this._eServerConn = this.T.actor('serverConn',
                                     this._usingServer.__name + ' mailstore ' +
                                       this.__name,
                                     null, this._usingServer);
    // (pending, but not active; they don't want/need expectations)
    this.RT.reportPendingActor(this._eClientConn);
    this.RT.reportPendingActor(this._eServerConn);

    this.RT.reportActiveActorThisStep(this._eRawClient);
    this.RT.reportActiveActorThisStep(this._usingServer._eServer);

    this._eRawClient.expect_connecting();
    this._eRawClient.expect_connected();
    this._eRawClient.expect_replicaCaughtUp();

    this._usingServer._eServer.expect_request('mailstore/mailstore');
    this._usingServer._eServer.expect_endpointConn('mailstore/mailstore');

    this._rawClient._connect();
  },

  setup_connect: function() {
    var self = this;
    this._connected = true;
    return this.T.convenienceSetup(this._eRawClient, 'connects to server',
                                   this._usingServer._eServer, function() {
      self.connect();
    });
  },

  //////////////////////////////////////////////////////////////////////////////
  // Contacts

  /**
   * Establish a contact relationship with another person (as identified by
   *  their client) *using magical self-ident knowing*.
   *
   * Because this is a stateful process that involves multiple actors, we
   *  consolidate and perform both directions as a single conceptual operation.
   */
  setup_mutualContact: function(other, interesting) {
    var self = this;
    // -- SELF req OTHER
    // - issue request, client through send, hold at sender
    this.T.convenienceSetup(self._eRawClient, 'request contact of', other,
                                   function() {
      // mark the local-store as active to make sure it generates no entries
      self.RT.reportActiveActorThisStep(self._eLocalStore);
      // the server should process this
      self.expectServerTaskToRun('userOutgoingContactRequest');
      self._eRawClient.expect_allActionsProcessed();
      // and let's expect and gate its request to the other user
      self._usingServer.holdAllMailSenderMessages();
      self._usingServer.expectContactRequestToServerUser(other._usingServer,
                                                         other);

      // initiate the connect process, save off the othident for test needs.
      var localPoco = {
        displayName: other.__name,
      };
      self._peepsByName[other.__name] =
        self._rawClient.connectToPeepUsingSelfIdent(
          other._rawClient._selfIdentBlob, localPoco);
    }).log.boring(!interesting);
    // - release to sender, their drop, mailstore. hold replica.
    this.T.convenienceSetup(other._usingServer,
        'receives contact request for', other, 'from', self, function() {
      other.expectServerTaskToRun('userIncomingContactRequest');

      other._usingServer.holdAllReplicaBlocksForUser(other);
      other._usingServer.expectReplicaBlocksForUser(other, 1);

      self._usingServer.releaseContactRequestToServerUser(other._usingServer,
                                                          other);
    }).log.boring(!interesting);
    // - release replica of request
    other._T_connectedClientsStep(other._usingServer,
        'delivers contact request to', '*PARAM*',
        function(paramClient) {
      self.RT.reportActiveActorThisStep(paramClient._eLocalStore);
      self.RT.reportActiveActorThisStep(paramClient._eRawClient);
      paramClient._eLocalStore.expect_contactRequest(
        self._rawClient.tellBoxKey);
      paramClient._eRawClient.expect_replicaCaughtUp();

      other._usingServer.releaseAllReplicaBlocksForClient(paramClient);
    });


    // -- OTHER req SELF
    this.T.convenienceSetup(other._eRawClient, 'request contact of', self,
                                   function() {
      other.expectServerTaskToRun('userOutgoingContactRequest');
      other._eRawClient.expect_allActionsProcessed();
      // the request message being sent to SELF
      other._usingServer.holdAllMailSenderMessages();
      other._usingServer.expectContactRequestToServerUser(self._usingServer,
                                                          self);
      // add-contact replica block is good to go!
      other._usingServer.holdAllReplicaBlocksForUser(other);
      other._usingServer.expectReplicaBlocksForUser(other, 1);

      var localPoco = {
        displayName: other.__name,
      };
      other._peepsByName[self.__name] =
        other._rawClient.connectToPeepUsingSelfIdent(
          self._rawClient._selfIdentBlob, localPoco);
    }).log.boring(!interesting);
    // - release replica of addcontact
    other._T_connectedClientsStep(other._usingServer,
        'delivers contact request to', '*PARAM*', function(paramClient) {
      self.RT.reportActiveActorThisStep(paramClient._eLocalStore);
      self.RT.reportActiveActorThisStep(paramClient._eRawClient);
      paramClient._eLocalStore.expect_replicaCmd('addContact',
                                                 self._rawClient.rootPublicKey);
      paramClient._eRawClient.expect_replicaCaughtUp();

      paramClient._dynamicNotifyModaActors('addingContact', self);

      other._usingServer.releaseAllReplicaBlocksForClient(paramClient);
    });
    // - release to sender, their drop, mailstore. hold replica.
    this.T.convenienceSetup(self._usingServer,
        'receives contact request for', self, 'from', other, function() {
      self.expectServerTaskToRun('userIncomingContactRequest');

      self._usingServer.holdAllReplicaBlocksForUser(self);
      self._usingServer.expectReplicaBlocksForUser(self, 1);

      other._usingServer.releaseContactRequestToServerUser(self._usingServer,
                                                           self);
    });
    // - release replica, boring.
    this._T_connectedClientsStep(self._usingServer,
        'delivers contact request to', '*PARAM*', function(paramClient) {
      self.RT.reportActiveActorThisStep(paramClient._eLocalStore);
      self.RT.reportActiveActorThisStep(paramClient._eRawClient);
      paramClient._eLocalStore.expect_replicaCmd('addContact',
                                                 self._rawClient.rootPublicKey);
      paramClient._eRawClient.expect_replicaCaughtUp();

      paramClient._dynamicNotifyModaActors('addingContact', other);

      self._usingServer.releaseAllReplicaBlocksForClient(paramClient);
    });

  },

  expectReplicaUpdate: function() {
    this.RT.reportActiveActorThisStep(this._eRawClient);
    this._eRawClient.expect_replicaCaughtUp();
  },

  /**
   * Assert that the client, per its local store, has a contact for the user
   *  represented by the provided client.
   */
  assertClientHasContact: function(other) {
    var userRootKey = this._rawClient.rootPublicKey,
        otherRootKey = other._rawClient.rootPublicKey;

    var storeDb = this._rawClient.store._db;
    this.expect_localStoreContactCheck(userRootKey, otherRootKey, true);

    var self = this;
    when(storeDb.getRowCell($client_schema.TBL_PEEP_DATA,
                            otherRootKey, "d:oident"),
         function(val) {
           self._logger.localStoreContactCheck(userRootKey, otherRootKey,
                                               val != null);
         });
  },

  /**
   * Create mutual friendship relationships between 'this' client and the
   *  provided clients.
   */
  setup_friendClique: function(friends) {
    var tofriend = friends.concat([this]);
      // (the destructive mutation is fine)
    while (tofriend.length >= 2) {
      var focal = tofriend.pop();
      for (var i = 0; i < tofriend.length; i++) {
        var other = tofriend[i];
        focal.setup_mutualContact(other);
      }
    }
  },

  check_friendClique: function(friends) {
    var tocheck = friends.concat([this]);
    return this.T.check(
        'assert mutual friend relationships among:', tocheck,
        function() {
      // (the destructive mutation is fine)
      while (tocheck.length >= 2) {
        var focal = tocheck.pop();
        for (var i = 0; i < tocheck.length; i++) {
          var other = tofriend[i];
          focal._usingServer.assertUserHasContact(focal, other);
          other._usingServer.assertUserHasContact(other, focal);
        }
      }
    });
  },

  //////////////////////////////////////////////////////////////////////////////
  // Conversation Actions (High-Level)

  /**
   * Start a conversation amongst some set of recipients.
   *
   * Because this results in a boatload of stuff happening, we break this out
   *  into multiple steps by using (test-only) gating of the messages from
   *  the maildrop's fanout server to the users to spread those into separate
   *  steps.
   */
  do_startConversation: function(tConv, tMsg, recipients) {
    if (!recipients.length) {
      throw new Error("No recipients supplied!");
    }

    var peepOIdents = [], peepPubrings = [],
        youAndMeBoth = [this].concat(recipients);

    var self = this, eServer = this._usingServer;
    // Setup conversation data; used during the setupFunc to relate known state
    //  about the conversation to other step-generating functions.  Differs from
    //  the live in-step data which represents that state of the conversation
    //  as far as actual execution has progressed.
    tConv.sdata = {
      participants: youAndMeBoth.concat(),
      fanoutServer: eServer,
    };
    // the live in-step data, null until our step is actually created!
    tConv.data = null;

    // - create the conversation
    this.T.action(this._eRawClient,
        'creates conversation, sends it to their mailstore on', eServer,
        function() {
      self._expect_createConversation_createPrep();

      var recipTestClient, iRecip;
      for (iRecip = 0; iRecip < recipients.length; iRecip++) {
        recipTestClient = recipients[iRecip];
        var othIdent = self._peepsByName[recipTestClient.__name];
        var othPubring = $pubring.createPersonPubringFromOthIdentDO_NOT_VERIFY(
                           othIdent);
        peepOIdents.push(othIdent);
        peepPubrings.push(othPubring);
      }

      var messageText = fakeDataMaker.makeSubject();

      // (we have to do this before the expectations because we don't know what
      //  to expect until we invoke this)
      var convCreationInfo = self._rawClient.createConversation(
                   peepOIdents, peepPubrings, messageText);

      self._expect_createConversation_rawclient_to_server(
        convCreationInfo, messageText, youAndMeBoth, tConv, tMsg);
    });
    this._expdo_createConversation_fanout_onwards(tConv);
  },

  // helper for do_startConversation and the moda variant
  _expect_createConversation_createPrep: function() {
    var eServer = this._usingServer;
    this._eRawClient.expect_allActionsProcessed();
    eServer.holdAllMailSenderMessages();
    eServer.expectPSMessageToUsFrom(this);
  },

  // helper for do_startConversation and the moda variant
  _expect_createConversation_rawclient_to_server: function(convCreationInfo,
                                                           messageText,
                                                           youAndMeBoth,
                                                           tConv, tMsg) {
    var backlog = [];
    for (var iRecip = 0; iRecip < youAndMeBoth.length; iRecip++) {
      var recipTestClient = youAndMeBoth[iRecip];

      var tJoin = this.T.thing('message', 'join ' + recipTestClient.__name);
      tJoin.data = {
        type: 'join',
        seq: this.RT.testDomainSeq++,
        inviter: this,
        who: recipTestClient
      };
      tJoin.digitalName = convCreationInfo.joinNonces[iRecip];
      backlog.push(tJoin);
    }

    tMsg.data = {
      type: 'message',
      seq: this.RT.testDomainSeq++,
      author: this,
      text: messageText
    };
    backlog.push(tMsg);

    tConv.data = {
      id: convCreationInfo.convId,
      seq: this.RT.testDomainSeq++,
      backlog: backlog,
      // XXX this is identical across all participants, but this is pretty
      //  sketchy for us to be extracting and storing.
      convMeta: convCreationInfo.convMeta,
      participants: youAndMeBoth.concat(),
    };

    tConv.digitalName = convCreationInfo.convId;
    tMsg.digitalName = convCreationInfo.msgNonce;
  },

  // helper for do_startConversation and the moda variant
  _expdo_createConversation_fanout_onwards: function(tConv) {
    var eServer = this._usingServer;
    // - the maildrop processes it
    var self = this;
    this.T.action(this._usingServer,
        'maildrop processes the new conversation, generating welcome messages',
        function() {
      tConv.sdata.fanoutServer.expectServerTaskToRun('createConversation');

      // expect one welcome message per participant (which we will hold)
      for (var iRecip = 0; iRecip < tConv.data.participants.length; iRecip++) {
        var recipTestClient = tConv.data.participants[iRecip];

        eServer.expectSSMessageToServerUser(
          'initialfan', recipTestClient._usingServer, recipTestClient);
      }
      // release the conversation creation message to the maildrop
      eServer.releasePSMessageToUsFrom(self);
    });

    // -- per-client receipt steps
    for (var iRecip = 0; iRecip < tConv.sdata.participants.length; iRecip++) {
      var recipTestClient = tConv.sdata.participants[iRecip];
      recipTestClient.do_expectConvWelcome(tConv, true);
    }
  },

  do_replyToConversationWith: function(tConv, tNewMsg) {
    // -- client composes message, mailstore receives, gated at sender
    var self = this;
    this.T.action(this._eRawClient, 'writes', tNewMsg, 'to', tConv,
                  ', sends it to their mailstore on', this._usingServer,
                  function() {
      self._expect_replyToConversation_replyPrep(tConv, tNewMsg);

      var messageText = fakeDataMaker.makeSubject();
      var msgInfo = self._rawClient.replyToConversation(tConv.data.convMeta,
                                                        messageText);

      self._expect_replyToConversation_rawclient_to_server(
        tConv, tNewMsg, msgInfo, messageText);
    });

    this._expdo_replyToConversation_fanout_onwards(tConv, tNewMsg);
  },
  // helper for do_replyToConversationWith and the moda variant
  _expect_replyToConversation_replyPrep: function(tConv, tNewMsg) {
    this._eRawClient.expect_allActionsProcessed();
    this._usingServer.holdAllMailSenderMessages();
    this._usingServer.expectPSMessageToServerFrom(tConv.sdata.fanoutServer,
                                                  this);
  },
  // helper for do_replyToConversationWith and the moda variant
  _expect_replyToConversation_rawclient_to_server: function(tConv, tNewMsg,
                                                            msgInfo,
                                                            messageText) {
    tNewMsg.data = {
      type: 'message',
      seq: this.RT.testDomainSeq++,
      author: this,
      text: messageText
    };
    tNewMsg.digitalName = msgInfo.msgNonce;
    tConv.data.backlog.push(tNewMsg);
  },
  // helper for do_replyToConversationWith and the moda variant
  _expdo_replyToConversation_fanout_onwards: function(tConv, tNewMsg) {
    var self = this;
    // -- sender releases to fanout maildrop, gated for all recipients
    this.T.action('conversation hosting server', tConv.sdata.fanoutServer,
                  'receives the message and processes it', function() {
      tConv.sdata.fanoutServer.expectServerTaskToRun('conversationMessage');

      // expect one welcome message per participant (which we will hold)
      for (var iRecip = 0; iRecip < tConv.data.participants.length; iRecip++) {
        var recipTestClient = tConv.data.participants[iRecip];

        tConv.sdata.fanoutServer.expectSSMessageToServerUser(
          'fannedmsg', recipTestClient._usingServer, recipTestClient);
      }

      // release the message to the fanout maildrop
      self._usingServer.releasePSMessageToServerFrom(tConv.sdata.fanoutServer,
                                                     self);
    });
    // -- per-client receipt steps
    for (var iRecip = 0; iRecip < tConv.sdata.participants.length; iRecip++) {
      var recipTestClient = tConv.sdata.participants[iRecip];
      recipTestClient.do_expectConvMessage(tConv, tNewMsg);
    }
  },

  do_inviteToConversation: function(invitedTestClient, tConv) {
    var self = this;
    // -- update setup-pass conversation state
    tConv.sdata.participants.push(invitedTestClient);
    var tJoin = self.T.thing('message', 'join ' + invitedTestClient.__name);

    // -- author composes invite, mailstore receives, gated at author sender
    this.T.action(this._eRawClient, 'invites', invitedTestClient, 'to', tConv,
                  function() {
      self._expect_inviteToConversation_invitePrep(invitedTestClient);

      var peepOIdent = self._peepsByName[invitedTestClient.__name];
      var peepPubring = $pubring.createPersonPubringFromOthIdentDO_NOT_VERIFY(
                          peepOIdent);
      var msgInfo = self._rawClient.inviteToConversation(tConv.data.convMeta,
                                           peepOIdent, peepPubring);

      self._expect_inviteToConversation_rawclient_to_server(
        invitedTestClient, tConv, tJoin, msgInfo);
    });

    this._expdo_inviteToConversation_sender_onwards(
      invitedTestClient, tConv, tJoin);
  },
  // helper for do_inviteToConversation and the moda variant
  _expect_inviteToConversation_invitePrep: function(invitedTestClient) {
    this._eRawClient.expect_allActionsProcessed();
    this._usingServer.holdAllMailSenderMessages();
    this._usingServer.expectPSMessageToServerFrom(
      invitedTestClient._usingServer, this);
  },
  // helper for do_inviteToConversation and the moda variant
  _expect_inviteToConversation_rawclient_to_server: function(invitedTestClient,
                                                             tConv, tJoin,
                                                             msgInfo) {
    tJoin.data = {
      type: 'join',
      seq: this.RT.testDomainSeq++,
      inviter: this,
      who: invitedTestClient
    };
    tJoin.digitalName = msgInfo.msgNonce;
    // note: we do not add this to the backlog until after the welcome message
    //  is generated because that's how the server does it.
  },
  // helper for do_inviteToConversation and the moda variant
  _expdo_inviteToConversation_sender_onwards: function(invitedTestClient,
                                                       tConv, tJoin) {
    var self = this;
    // -- author sender releases to invitee, fan-in processes, gated for resend
    this.T.action(this._usingServer, 'delivers join request to',
                  invitedTestClient._usingServer, function() {
      invitedTestClient.expectServerTaskToRun('conversationJoin');

      invitedTestClient._usingServer.holdAllMailSenderMessages();
      // they will send the joined message back to us
      invitedTestClient._usingServer.expectSSMessageToServerUser(
        'joined', self._usingServer, self);

      self._usingServer.releasePSMessageToServerFrom(
        invitedTestClient._usingServer, self);
    });

    // -- invitee resend released to author fan-in, convadd gated for fan-out
    this.T.action(invitedTestClient._usingServer,
                  'processes join and delivers joined notification to',
                  this._usingServer,
                  function() {
      self.expectServerTaskToRun('conversationJoined');
      self._usingServer.expectPSMessageToServerFrom(
        tConv.sdata.fanoutServer, self);

      invitedTestClient._usingServer.releaseSSMessageToServerUser(
        'joined', self._usingServer, self);
    });

    // -- convadd released to fan-out, processes, welcome and joins gated.
    this.T.action(this._usingServer, 'delivers convadd request to',
                  tConv.sdata.fanoutServer,
                  'resulting in a welcome and several join messages',
                  function() {
      tConv.sdata.fanoutServer.expectServerTaskToRun('conversationAdd');

      // the welcome
      tConv.sdata.fanoutServer.expectSSMessageToServerUser(
        'fannedmsg', invitedTestClient._usingServer, invitedTestClient);
      // the join messages
      for (var iRecip = 0; iRecip < tConv.data.participants.length; iRecip++) {
        var recipTestClient = tConv.data.participants[iRecip];

        tConv.sdata.fanoutServer.expectSSMessageToServerUser(
          'fannedmsg', recipTestClient._usingServer, recipTestClient);
      }

      self._usingServer.releasePSMessageToServerFrom(
        tConv.sdata.fanoutServer, self);
    });

    // -- release the welcome, let it be processed through
    invitedTestClient.do_expectConvWelcome(tConv, false);

    this.T.convenienceSetup('testframework metadata fixup', function() {
      // now it is safe to add the join to the backlog since the welcome has
      //  been generated.
      tConv.data.backlog.push(tJoin);
    });

    // -- release the joins
    for (var iRecip = 0; iRecip < tConv.sdata.participants.length; iRecip++) {
      var recipTestClient = tConv.sdata.participants[iRecip];
      recipTestClient.do_expectConvMessage(tConv, tJoin);
    }
  },

  //////////////////////////////////////////////////////////////////////////////
  // Conversation Expectations

  // XXX this needs more thought about who to attribute it to
  expectServerTaskToRun: function(taskName) {
    var eTask = this.T.actor(taskName, [this.__name], null, this);
    this.RT.reportActiveActorThisStep(eTask);
    eTask.expectOnly__die();
  },

  /**
   * Expect a welcome-message for the given conversation.  Sub-expectations are
   *  based on the state of the conversation at the time the step is executed,
   *  so don't use this for race situations naively.
   *
   * This is broken into two steps:
   * - Mailstore receipt/processing, with replica blocks gated.
   * - Replica block delivery to the client.
   *
   * XXX handle disconnected clients, cloned clients
   */
  do_expectConvWelcome: function(tConv, isInitial) {
    var self = this;
    self.T.action(self._usingServer,
        'receives welcome message for', self,
        'and the mailstore processes it.', function() {
      // we want to wait for the total completion of the task.
      // XXX when we start using queueing, this should change to
      //  userConvWelcome, or whatever wraps it instead of us.
      self.expectServerTaskToRun(
        isInitial ? 'initialFanoutToUserMessage' : 'fanoutToUserMessage');

      self._usingServer.holdAllReplicaBlocksForUser(self);
      // welcome + backlog
      self._usingServer.expectReplicaBlocksForUser(self,
                                               1 + tConv.data.backlog.length);

      tConv.sdata.fanoutServer.releaseSSMessageToServerUser(
        isInitial ? 'initialfan' : 'fannedmsg', self._usingServer, self);
    });
    self._T_connectedClientsStep(self._usingServer,
        'delivers conversation welcome message to', '*PARAM*',
        function(paramClient) {
      self.RT.reportActiveActorThisStep(paramClient._eRawClient);
      self.RT.reportActiveActorThisStep(paramClient._eLocalStore);
      var els = paramClient._eLocalStore;

      els.expect_newConversation(tConv.data.id); // (unreported 'welcome')

      for (var iMsg = 0; iMsg < tConv.data.backlog.length; iMsg++) {
        var tMsg = tConv.data.backlog[iMsg];
        paramClient.expectLocalStoreTaskToRun(
          self._MSG_TYPE_TO_LOCAL_STORE_TASK[tMsg.data.type]);
        els.expect_conversationMessage(tConv.data.id, tMsg.digitalName);
      }
      paramClient._eRawClient.expect_replicaCaughtUp();

      paramClient._dynamicNotifyModaActors('receiveConvWelcome', tConv);
      paramClient._dynamicNotifyModaActors('updatePhaseComplete');

      self._usingServer.releaseAllReplicaBlocksForClient(paramClient);
    });
  },

  _MSG_TYPE_TO_LOCAL_STORE_TASK: {
    'join': 'convJoin',
    'message': 'convMessage',
    'meta': 'convMeta',
  },

  /**
   * Expect a message for the given conversation.
   *
   * This is broken intwo two steps:
   * - Mailstore receipt/processing, with replica blocks gated.
   * - Replica block delivery to the client.
   *
   * XXX handle disconnected clients, cloned clients
   */
  do_expectConvMessage: function(tConv, tMsg) {
    var self = this;
    self.T.action(self._usingServer,
        'receives message for', self,
        'and the mailstore processes it.', function() {
      self.expectServerTaskToRun('fanoutToUserMessage');

      self._usingServer.holdAllReplicaBlocksForUser(self);
      // just the one message
      self._usingServer.expectReplicaBlocksForUser(self, 1);

      tConv.sdata.fanoutServer.releaseSSMessageToServerUser(
        'fannedmsg', self._usingServer, self);
    });
    self._T_connectedClientsStep(self._usingServer,
        'delivers', tMsg, 'to', '*PARAM*',
        function(paramClient) {
      self.RT.reportActiveActorThisStep(paramClient._eRawClient);
      self.RT.reportActiveActorThisStep(paramClient._eLocalStore);
      var els = paramClient._eLocalStore;

      paramClient.expectLocalStoreTaskToRun(
        self._MSG_TYPE_TO_LOCAL_STORE_TASK[tMsg.data.type]);
      els.expect_conversationMessage(tConv.data.id, tMsg.digitalName);

      paramClient._eRawClient.expect_replicaCaughtUp();

      paramClient._dynamicNotifyModaActors('receiveConvMessage', tConv, tMsg);
      paramClient._dynamicNotifyModaActors('updatePhaseComplete');

      self._usingServer.releaseAllReplicaBlocksForClient(paramClient);
    });
  },

  //////////////////////////////////////////////////////////////////////////////
  // General Expectations

  expectLocalStoreTaskToRun: function(taskName) {
    var eTask = this.T.actor(taskName, [this.__name], null, this);
    this.RT.reportActiveActorThisStep(eTask);
    eTask.expectOnly__die();
  },

  //////////////////////////////////////////////////////////////////////////////
};

var TestServerActorMixins = {
  __constructor: function(self, opts) {
    self._eServer = self.T.actor('server', self.__name, null, self);
    self._eDb = self.T.actor('gendbConn', self.__name, null, self);
    var rootKeyring, keyring;
    self.T.convenienceSetup(self._eServer, 'created, listening to get port.',
                            self._eDb, 'established',
                            function() {
      // - create our synthetic logger...
      self._logger = LOGFAB.testServer(self, null, self.__name);
      self._logger._actor = self;

      // - create our identity
      rootKeyring = $keyring.createNewServerRootKeyring();
      keyring = rootKeyring.issueLongtermBoxingKeyring();

      self.T.ownedThing(self, 'key', self.__name + ' root',
                        keyring.rootPublicKey);
      self.T.ownedThing(self, 'key', self.__name + ' longterm',
                        keyring.boxingPublicKey);

      // - create the server
      self._eServer.expect_listening();

      self._server = new $authconn.AuthorizingServer(self._logger,
                                                     keyring.boxingPublicKey);
      self._server.listen();

      // - establish db connection
      // (we want to make sure this happens successfully, hence the actor)
      self._eDb.expect_connected();
      self._db = $gendb.makeTestDBConnection(self.__name, self._logger);
    });
    self.T.convenienceSetup(
      self, 'creates its identity and registers implementations', function() {

      var details = {
        tag: 'server:dummy',
        url: 'ws://127.0.0.1:' + self._server.address.port + '/',
      };
      var signedSelfIdent = self.__signedSelfIdentBlob =
        $pubident.generateServerSelfIdent(rootKeyring, keyring, details);

      // -- create api's, bind server definitions
      var serverConfig = self._config =
          $configurer.__populateTestConfig(keyring, signedSelfIdent,
                                           self._db, opts.roles,
                                           gClobberNamespace,
                                           self._logger);
      serverConfig.__registerServers(self._server);
    });
    self.T.convenienceDeferredCleanup(self, 'cleans up, killing', self._eServer,
                                      'shutting down', self._eDb,
                              function() {
      // if we did not initialize, just bail
      if (!self._server)
        return;
      self._server.shutdown();
      $gendb.cleanupTestDBConnection(self._db);

      self._eDb.expect_closed();
      self._db.close();
    });
  },


  assertUserHasContact: function(userClient, otherUserClient) {
  },

  assertClientAuthorizationState: function(testClient, isAuthorized) {
    var userRootKey = testClient._rawClient.rootPublicKey;
    this.expect_userAuthorizationCheck(userRootKey, isAuthorized);
    var clientKey = testClient._rawClient.clientPublicKey;
    this.expect_clientAuthorizationCheck(clientKey, isAuthorized);

    var self = this;
    when(this._config.authApi.serverCheckUserAccount(userRootKey),
      function(val) {
        self._logger.userAuthorizationCheck(userRootKey, val);
      });

    when(this._config.authApi.serverCheckClientAuth(clientKey),
      function(val) {
        self._logger.clientAuthorizationCheck(clientKey, val);
      });
  },

  //////////////////////////////////////////////////////////////////////////////
  // Holding: mailsender
  //
  // We hold mailsender blocks by wrapping the sender API and deferring the
  //  calls to the underlying implementation until released.

  /**
   * Tell our mailsender to hold all send messages pending explicit release
   *  calls.  This is *only* to be used to be able to break steps up into
   *  human-comprehensible sized pieces.  If you are doing this to make a test
   *  pass, then you are burning karma at a dangerous pace, good sir.
   *
   * Be sure to match this with a call to
   *  `stopHoldingAndAssertNoHeldSendMessages` when you are done with whatever
   *  controlled series of steps you are getting up to.  (We do not want this
   *  active all the time, as it is possible for there to be flows that we don't
   *  want to break apart into separate steps.)
   */
  holdAllMailSenderMessages: function() {
    this._config.senderApi.__hold_all(true);
  },

  /**
   * Tell the mailsender to stop holding all messages.  Generate a failure if
   *  there are any held messages at this point, as it suggests some message
   *  unintentionally ran afoul of our hold-up and either the tests or the
   *  test framework need to be adapted to handle reality.
   */
  stopHoldingAndAssertNoHeldSendMessages: function() {
    this._config.senderApi.__hold_all(false);
  },

  /**
   * Expect a loopback Person-to-Server message from a specific user of ours.
   */
  expectPSMessageToUsFrom: function(testClient) {
    this.RT.reportActiveActorThisStep(this);
    this.expect_sender_sendPersonEnvelopeToServer(
      this._config.keyring.boxingPublicKey,
      testClient._rawClient.rootPublicKey);
  },

  /**
   * Release a held Person-to-Server message from a specific user of ours.
   */
  releasePSMessageToUsFrom: function(testClient) {
    this._config.senderApi.__release_sendPersonEnvelopeToServer(
      this._config.keyring.boxingPublicKey,
      testClient._rawClient.rootPublicKey);
  },

  /**
   * Expect a Person-to-Server message targeted at a given server from a
   *  specific user of ours.
   */
  expectPSMessageToServerFrom: function(testServer, testClient) {
    this.RT.reportActiveActorThisStep(this);
    this.expect_sender_sendPersonEnvelopeToServer(
      testServer._config.keyring.boxingPublicKey,
      testClient._rawClient.rootPublicKey);
  },
  /**
   * Release a Person-to-Server message targeted at a given server from a
   *  specific user of ours.
   */
  releasePSMessageToServerFrom: function(testServer, testClient) {
    expectAuthconnFromTo(this, testServer, 'drop/deliver');

    this._config.senderApi.__release_sendPersonEnvelopeToServer(
      testServer._config.keyring.boxingPublicKey,
      testClient._rawClient.rootPublicKey);
  },

  /**
   * Expect a Server-to-Server message from ourselves to another server
   *  of a given type and intended for a given user.  (We peek inside the
   *  envelope.)
   */
  expectSSMessageToServerUser: function(type, testServer, testClient) {
    this.RT.reportActiveActorThisStep(this);
    this.expect_sender_sendServerEnvelopeToServer(
      type, testClient._rawClient.tellBoxKey,
      testServer._config.keyring.boxingPublicKey);
  },

  /**
   * Release a Server-to-Server message from ourselves to another server
   *  of a given type and intended for a given user.  (We peek inside the
   *  envelope.)
   */
  releaseSSMessageToServerUser: function(type, testServer, testClient) {
    expectAuthconnFromTo(this, testServer, 'drop/deliver');

    this._config.senderApi.__release_sendServerEnvelopeToServer(
      type, testClient._rawClient.tellBoxKey,
      testServer._config.keyring.boxingPublicKey);
  },

  expectContactRequestToServerUser: function(testServer, testClient) {
    this.RT.reportActiveActorThisStep(this);
    this.expect_sender_sendContactEstablishmentMessage(
      testClient._rawClient.tellBoxKey,
      testServer._config.keyring.boxingPublicKey);
  },
  releaseContactRequestToServerUser: function(testServer, testClient) {
    expectAuthconnFromTo(this, testServer, 'drop/establish');

    this._config.senderApi.__release_sendContactEstablishmentMessage(
      testClient._rawClient.tellBoxKey,
      testServer._config.keyring.boxingPublicKey);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Holding: Replica Blocks
  //
  // We hold replica blocks on a per-client basis by wrapping their replica
  //  notification function and deferring calls to it.  For the time being we
  //  do not differentiate between types of replica blocks because they are not
  //  great at being easily differentiated right now.

  /**
   * Tell our mailstore to hold all replica blocks (or other unsolicited
   *  notifications) for all the clients of a user (identified by their
   *  canonical client) pending explicit release calls.  Used for step-sanity,
   *  don't abuse.  Call `stopHoldingAndAssertNoHeldReplicaBlocks` when done.
   */
  holdAllReplicaBlocksForUser: function(testClient) {
    var csc = testClient._eServerConn._logger.__instance.appConn;
    // wrap it for hold support if not already wrapped
    if (!("__hold_all" in csc))
      $testwrap_mailstore.storeConnWrap(csc, testClient._logger);

    csc.__hold_all(true);
  },

  /**
   * Expect some number of replica blocks to be queued for all of the clients of
   *  a user.
   *
   * This does assume that all of the clones are fully subscribed to everything.
   */
  expectReplicaBlocksForUser: function(testClient, expectedCount) {
    for (var i = 0; i < testClient._allClones.length; i++) {
      var cloneClient = testClient._allClones[i];
      testClient.RT.reportActiveActorThisStep(cloneClient);
      var count = expectedCount;
      while (count--) {
        cloneClient.expect_replicaBlockNotifiedOnServer();
      }
    }
  },

  /**
   * Release the queued replica blocks for a specific client; intended to be
   *  used within steps defined via `_T_connectedClientsStep` or similar.
   */
  releaseAllReplicaBlocksForClient: function(testClient) {
    var csc = testClient._eServerConn._logger.__instance.appConn;
    while(csc.__release_heyAReplicaBlock()) {
      // just keep calling that guy until it returns 0.
    }
  },

  /**
   * Counterpart to `holdAllReplicaBlocks`.
   */
  stopHoldingAndAssertNoHeldReplicaBlocksForUse: function(testClient) {
    var csc = testClient._eServerConn._logger.__instance.appConn;
    csc.__hold_all(false);
  },

  //////////////////////////////////////////////////////////////////////////////
  // General Expectations

  // XXX this needs more thought about who to attribute it to
  expectServerTaskToRun: function(taskName) {
    var eTask = this.T.actor(taskName, [this.__name], null, this);
    this.RT.reportActiveActorThisStep(eTask);
    eTask.expectOnly__die();
  },

  //////////////////////////////////////////////////////////////////////////////
};

var MessageThingMixins = {
  expect_receivedBy: function() {
  },
};

var LOGFAB = exports.LOGFAB = $log.register($module, {
  testClient: {
    // we are a client/server client, even if we are smart for one
    type: $log.TEST_SYNTHETIC_ACTOR,
    subtype: $log.CLIENT,
    topBilling: true,

    events: {
      // - db checks
      localStoreContactCheck: {userRootKey: 'key', otherUserRootKey: 'key',
                               present: true},

      // - hold-related
      replicaBlockNotifiedOnServer: {},
    },
    TEST_ONLY_events: {
      replicaBlockNotifiedOnServer: {block: false},
    },
  },
  testServer: {
    // we are a client/server client, even if we are smart for one
    type: $log.TEST_SYNTHETIC_ACTOR,
    subtype: $log.SERVER,
    topBilling: true,

    events: {
      // - db checks
      clientAuthorizationCheck: {clientRootKey: 'key', isAuthorized: true},
      userAuthorizationCheck: {userRootKey: 'key', isAuthorized: true},
      clientContactCheck: {userRootKey: 'key', otherUserRootKey: 'key',
                           isAuthorized: true},

      // - hold-related
      sender_sendPersonEnvelopeToServer: {serverKey: 'key',
                                          userRootKey: 'key'},
      sender_sendServerEnvelopeToServer: {type: true, userTellKey: 'key',
                                          otherServerKey: 'key'},
      sender_sendContactEstablishmentMessage: {name: 'key',
                                               otherServerKey: 'key'},
    },
  }
});

exports.TESTHELPER = {
  LOGFAB_DEPS: [LOGFAB,
    $authconn.LOGFAB, $gendb.LOGFAB,
    $rawclient_api.LOGFAB, $client_localdb.LOGFAB, $client_notif.LOGFAB,
    $client_tasks.LOGFAB,

    $signup_server.LOGFAB,
    $maildrop_server.LOGFAB,
    $mailsender_local_api.LOGFAB,

    $mailstore_uproc.LOGFAB,
  ],

  actorMixins: {
    testClient: TestClientActorMixins,
    testServer: TestServerActorMixins,
  },

  thingMixins: {
    message: MessageThingMixins,
  },
};


}); // end define
