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
 *
 **/

define(function(require,exports,$module) {

var $Q = require('q'),
    when = $Q.when;

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
    $mailsender_local_api = require('rdservers/mailsender/localapi');

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
  setup_superFriends: function(friends) {
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

  check_superFriends: function(friends) {
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
  // Messaging

  startConversation: function(tConv, tMsgThing, recipients) {
    var iRecip;
    var peepOIdents = [], peepPubrings = [];
    for (iRecip = 0; iRecip < recipients.length; iRecip++) {
      var recipTestClient = recipients[iRecip];
      var othIdent = this._peepsByName[recipTestClient.__name];
      var othPubring = $pubring.createPersonPubringFromOthIdentDO_NOT_VERIFY(
                         othIdent);
      peepOIdents.push(othIdent);
      peepPubrings.push(othPubring);
    }

    // - create the conversation
    // (we have to do this before the expectations because we don't know what
    //  to expect until we invoke this)
    var convInfo = this._rawClient.createConversation(
                     peepOIdents, peepPubrings, "I AM A TEST MESSAGE BODY");

    tConv.digitalName = convInfo.convId;
    tMsgThing.digitalName = convInfo.msgNonce;

    // - expectations
    // we'll call it done when it hits the clients
    if (!recipients.length) {
      throw new Error("No recipients supplied!");
    }
    for (iRecip = 0; iRecip < recipients.length; iRecip++) {
      var recipTestClient = recipients[iRecip];

      this.RT.reportActiveActorThisStep(recipTestClient._eLocalStore);
      recipTestClient._eLocalStore.expect_newConversation(convInfo.convId);
      recipTestClient._eLocalStore.expect_conversationMessage(
        convInfo.convId, convInfo.msgNonce);
    }
  },

  replyToMessageWith: function(msgReplyingTo, outMsgThing) {
  },

  expect_receiveMessages: function() {
  },

  inviteToConv: function(recipient, outConvThing) {
    throw new Error("XXX NOT IMPLEMENTED");
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
                                           self._db, opts.roles, self._logger);
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
      localStoreContactCheck: {userRootKey: 'key', otherUserRootKey: 'key',
                               present: true},
    },
  },
  testServer: {
    // we are a client/server client, even if we are smart for one
    type: $log.TEST_SYNTHETIC_ACTOR,
    subtype: $log.SERVER,

    events: {
      clientAuthorizationCheck: {clientRootKey: 'key', isAuthorized: true},
      userAuthorizationCheck: {userRootKey: 'key', isAuthorized: true},
      clientContactCheck: {userRootKey: 'key', otherUserRootKey: 'key',
                           isAuthorized: true},
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
