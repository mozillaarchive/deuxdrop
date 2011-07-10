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
    $rawclient_api = require('rdcommon/rawclient/api'),
    $client_localdb = require('rdcommon/rawclient/localdb'),
    $authconn = require('rdcommon/transport/authconn'),
    $keyring = require('rdcommon/crypto/keyring'),
    $pubring = require('rdcommon/crypto/pubring'),
    $pubident = require('rdcommon/identities/pubident');

var $gendb = require('rdservers/gendb/redis'),
    $configurer = require('rdservers/configurer');

var $signup_server = require('rdservers/signup/server'),
    $maildrop_server = require('rdservers/maildrop/server'),
    $mailstore_uproc = require('rdservers/mailstore/uproc'),
    $mailsender_local_api = require('rdservers/mailsender/localapi');

var $testwrap_sender = require('rdservers/mailsender/testwrappers'),
    $testwrap_mailstore = require('rdservers/mailstore/testwrappers');

var gClobberNamespace = {
  senderApi: $testwrap_sender,
};

var fakeDataMaker = new $testdata.DataFabricator();

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
  // Server Accounts

  /**
   * Perform a signup with the given server.  This is marked private because
   *  we really need to know `_usingServer` during the step definition for
   *  many of other helpers, so we really want test code to call our
   *  `setup_useServer` function instead since it runs at step definition time.
   */
  _signupWith: function(testServerActor) {
    // create actors corresponding to the connections so we can make sure they
    //  die.
    var eClientConn = this.T.actor('clientConn', this.__name + ' signup',
                                   null, this),
        eServerConn = this.T.actor('serverConn',
                                   testServerActor.__name + ' signup ' +
                                     this.__name,
                                   null, testServerActor);
    this.RT.reportActiveActorThisStep(eClientConn);
    eClientConn.expectOnly__die();
    this.RT.reportActiveActorThisStep(eServerConn);
    eServerConn.expectOnly__die();

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
    return this.T.convenienceSetup(this._eRawClient, 'connects to server',
                                   this._usingServer._eServer, function() {
      self.connect();
    });
  },

  //////////////////////////////////////////////////////////////////////////////
  // Contacts

  /**
   * Add another client as a contact of ours *using magical self-ident knowing*
   *  as the means of knowing the other contact's identity.
   *
   * We place our expectation on our mailstore server acknowledging the
   *  completion of our request.  If the mailstore is living on its own, we
   *  would want to also place an expectation on the permission hitting the
   *  maildrop.
   */
  addContact: function(other) {
    this.RT.reportActiveActorThisStep(this._eRawClient);
    this._eRawClient.expect_allActionsProcessed();

    this._peepsByName[other.__name] =
      this._rawClient.connectToPeepUsingSelfIdent(
        other._rawClient._selfIdentBlob);
  },

  setup_addContact: function(other) {
    var self = this;
    return this.T.convenienceSetup(self, 'add contact of', other, function() {
      self.addContact(other);
      //focal._usingServer.expect_clientAddedContact(focal, other);
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
    when(storeDb.getRowCell($client_localdb._DB_NAMES.TBL_PEEP_DATA,
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
        focal.setup_addContact(other);
        other.setup_addContact(focal);
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
      var backlog = [], recipTestClient, iRecip;
      for (iRecip = 0; iRecip < recipients.length; iRecip++) {
        recipTestClient = recipients[iRecip];
        var othIdent = self._peepsByName[recipTestClient.__name];
        var othPubring = $pubring.createPersonPubringFromOthIdentDO_NOT_VERIFY(
                           othIdent);
        peepOIdents.push(othIdent);
        peepPubrings.push(othPubring);
      }

      for (iRecip = 0; iRecip < youAndMeBoth.length; iRecip++) {
        recipTestClient = youAndMeBoth[iRecip];

        var tJoin = self.T.thing('message', 'join ' + recipTestClient.__name);
        tJoin.data = {
          type: 'join',
          who: recipTestClient
        };
        backlog.push(tJoin);
      }

      self._eRawClient.expect_allActionsProcessed();
      eServer.holdAllMailSenderMessages();
      eServer.expectPSMessageToUsFrom(self);

      var messageText = fakeDataMaker.makeSubject();

      // (we have to do this before the expectations because we don't know what
      //  to expect until we invoke this)
      var convCreationInfo = self._rawClient.createConversation(
                   peepOIdents, peepPubrings, messageText);
      tMsg.data = {
        type: 'message',
        nonce: convCreationInfo.msgNonce,
        text: messageText
      };
      backlog.push(tMsg);

      tConv.data = {
        id: convCreationInfo.convId,
        backlog: backlog,
        // XXX this is identical across all participants, but this is pretty
        //  sketchy for us to be extracting and storing.
        convMeta: convCreationInfo.convMeta,
        participants: youAndMeBoth.concat(),
      };

      tConv.digitalName = convCreationInfo.convId;
      tMsg.digitalName = convCreationInfo.msgNonce;
    });
    // - the maildrop processes it
    this.T.action(this._usingServer,
        'maildrop processes the new conversation, generating welcome messages',
        function() {
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
      recipTestClient.do_expectConvWelcome(tConv, eServer);
    }
  },

  do_replyToConversationWith: function(tConv, tNewMsg) {
    // -- client composes message, mailstore receives, gated at sender
    var self = this;
    this.T.action(this._eRawClient, 'writes', tNewMsg, 'to', tConv,
                  'sends it to their mailstore on', this._usingServer,
                  function() {
      self._eRawClient.expect_allActionsProcessed();
      self._usingServer.holdAllMailSenderMessages();
      self._usingServer.expectPSMessageToServerFrom(tConv.sdata.fanoutServer,
                                                    self);

      var messageText = fakeDataMaker.makeSubject();
      var msgInfo = self._rawClient.replyToConversation(tConv.data.convMeta,
                                                        messageText);
      tNewMsg.data = {
        type: 'message',
        nonce: msgInfo.msgNonce,
        text: messageText
      };
      tConv.data.backlog.push(tNewMsg);
    });

    // -- sender releases to fanout maildrop, gated for all recipients
    this.T.action('conversation hosting server', tConv.sdata.fanoutServer,
                  'receives the message and processes it', function() {
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

  do_inviteToConversation: function(recipient, outConvThing) {
    // -- author composes invite, mailstore receives, gated at author sender
    // -- author sender releases to invitee, fan-in processes, gated for resend
    // -- invitee resend released to author fan-in, convadd gated for fan-out
    // -- convadd released to fan-out, processes, welcome and joins gated.
    // -- release the welcome, let it be processed through
    // -- release the joins one-by-one to the recipients
  },

  //////////////////////////////////////////////////////////////////////////////
  // Conversation Expectations

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
  do_expectConvWelcome: function(tConv) {
    var self = this;
    self.T.action(self._usingServer,
        'receives welcome message for', self,
        'and the mailstore processes it.', function() {
      // we want to wait for the total completion of the task.
      // XXX when we start using queueing, this should change to
      //  userConvWelcome, or whatever wraps it instead of us.
      var eWelcomeTask = self.T.actor('initialFanoutToUserMessage',
                                      [self.__name],
                                      null, self);
      self.RT.reportActiveActorThisStep(eWelcomeTask);
      eWelcomeTask.expectOnly__die();

      self._usingServer.holdAllReplicaBlocksFor(self);
      // welcome + backlog
      self._usingServer.expectReplicaBlocksFor(self,
                                               1 + tConv.data.backlog.length);

      tConv.sdata.fanoutServer.releaseSSMessageToServerUser(
        'initialfan', self._usingServer, self);
    });
    self.T.action(self._usingServer,
        'delivers conversation welcome message to', self,
        function() {
      self.RT.reportActiveActorThisStep(self._eRawClient);
      self.RT.reportActiveActorThisStep(self._eLocalStore);
      var els = self._eLocalStore;

      els.expect_newConversation(tConv.data.id); // (unreported 'welcome')

      for (var iMsg = 0; iMsg < tConv.data.backlog.length; iMsg++) {
        var tMsg = tConv.data.backlog[iMsg];
        els.expect_proc_conv(tMsg.data.type);
        switch (tMsg.data.type) {
          case 'message':
            els.expect_conversationMessage(tConv.data.id, tMsg.data.nonce);
            break;
        }
      }
      self._eRawClient.expect_replicaCaughtUp();

      self._usingServer.releaseAllReplicaBlocksFor(self);
    });
  },

  /**
   * Expect a human-message for the given conversation.
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
      // we want to wait for the total completion of the task.
      var eMessageTask = self.T.actor('fanoutToUserMessage',
                                      [self.__name],
                                      null, self);
      self.RT.reportActiveActorThisStep(eMessageTask);
      eMessageTask.expectOnly__die();

      self._usingServer.holdAllReplicaBlocksFor(self);
      // just the one message
      self._usingServer.expectReplicaBlocksFor(self, 1);

      tConv.sdata.fanoutServer.releaseSSMessageToServerUser(
        'fannedmsg', self._usingServer, self);
    });
    self.T.action(self._usingServer,
        'delivers', tMsg, 'to', self,
        function() {
      self.RT.reportActiveActorThisStep(self._eRawClient);
      self.RT.reportActiveActorThisStep(self._eLocalStore);
      var els = self._eLocalStore;

      els.expect_proc_conv(tMsg.data.type);
      els.expect_conversationMessage(tConv.data.id, tMsg.data.nonce);

      self._eRawClient.expect_replicaCaughtUp();

      self._usingServer.releaseAllReplicaBlocksFor(self);
    });
  },

  //////////////////////////////////////////////////////////////////////////////
};

var TestServerActorMixins = {
  __constructor: function(self, opts) {
    self._eServer = self.T.actor('server', self.__name, null, self);
    self._eDb = self.T.actor('gendbConn', self.__name, null, self);
    self.T.convenienceSetup(self._eServer, 'created, listening to get port.',
                            self._eDb, 'established',
                            function() {
      // - create our synthetic logger...
      self._logger = LOGFAB.testServer(self, null, self.__name);
      self._logger._actor = self;

      // - create the server
      self._eServer.expect_listening();

      self._server = new $authconn.AuthorizingServer(self._logger);
      self._server.listen();

      // - establish db connection
      // (we want to make sure this happens successfully, hence the actor)
      self._eDb.expect_connected();
      self._db = $gendb.makeTestDBConnection(self.__name, self._logger);
    });
    self.T.convenienceSetup(
      self, 'creates its identity and registers implementations', function() {
      // -- create our identity
      var rootKeyring = $keyring.createNewServerRootKeyring(),
          keyring = rootKeyring.issueLongtermBoxingKeyring();

      self.T.ownedThing(self, 'key', self.__name + ' root',
                        keyring.rootPublicKey);
      self.T.ownedThing(self, 'key', self.__name + ' longterm',
                        keyring.boxingPublicKey);

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
    this._config.senderApi.__release_sendServerEnvelopeToServer(
      type, testClient._rawClient.tellBoxKey,
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
   *  notifications) pending explicit release calls.  Used for step-sanity,
   *  don't abuse.  Call `stopHoldingAndAssertNoHeldReplicaBlocks` when done.
   */
  holdAllReplicaBlocksFor: function(testClient) {
    var csc = testClient._eServerConn._logger.__instance.appConn;
    // wrap it for hold support if not already wrapped
    if (!("__hold_all" in csc))
      $testwrap_mailstore.storeConnWrap(csc, testClient._logger);

    csc.__hold_all(true);
  },

  /**
   * Expect some number of replica blocks to be queued for the client.
   */
  expectReplicaBlocksFor: function(testClient, expectedCount) {
    while (expectedCount--) {
      testClient.expect_replicaBlockNotifiedOnServer();
    }
  },

  releaseAllReplicaBlocksFor: function(testClient) {
    var csc = testClient._eServerConn._logger.__instance.appConn;
    while(csc.__release_heyAReplicaBlock()) {
      // just keep calling that guy until it returns 0.
    }
  },

  /**
   * Counterpart to `holdAllReplicaBlocks`.
   */
  stopHoldingAndAssertNoHeldReplicaBlocks: function() {
    var csc = testClient._eServerConn._logger.__instance.appConn;
    csc.__hold_all(false);
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

    events: {
      // - db checks
      localStoreContactCheck: {userRootKey: 'key', otherUserRootKey: 'key',
                               present: true},

      // - hold-related
      replicaBlockNotifiedOnServer: {},
    },
  },
  testServer: {
    // we are a client/server client, even if we are smart for one
    type: $log.TEST_SYNTHETIC_ACTOR,
    subtype: $log.SERVER,

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
    },
  }
});

exports.TESTHELPER = {
  LOGFAB_DEPS: [LOGFAB,
    $authconn.LOGFAB, $gendb.LOGFAB,
    $rawclient_api.LOGFAB, $client_localdb.LOGFAB,

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
