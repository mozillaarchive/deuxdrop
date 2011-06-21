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
    $authconn = require('rdcommon/transport/authconn'),
    $keyring = require('rdcommon/crypto/keyring'),
    $pubident = require('rdcommon/identities/pubident');

var $gendb = require('rdservers/gendb/redis');

var $signup_server = require('rdservers/signup/server'),
    $authdb_api = require('rdservers/authdb/api'),
    $configurer = require('rdservers/configurer');

var TestClientActorMixins = {
  /**
   * Automatically create an identity; a client is not much use without one.
   *  (In the future we may look at the argument bundle provided to the actor
   *  instantiation in order to use an existing one too.)
   */
  __constructor: function(self) {

    // -- define the raw client and its setup step
    self._eRawClient = self.T.actor('rawClient', self.__name, null, self);
    self.T.convenienceSetup(self._eRawClient, 'creates identity',
        function() {
      // - create our self-corresponding logger the manual way
      // (we deferred until this point so we could nest in the hierarchy
      //  in a traditional fashion.)
      self._logger = LOGFAB.testClient(self, null, self.__name);
      self._logger._actor = self;

      // - create the client with a new identity
      var poco = {
        displayName: self.__name,
      };
      self._rawClient = $rawclient_api.makeClientForNewIdentity(poco,
                                                                self._logger);

      // - bind names to our public keys (so the logs are less gibberish)
      self.T.thing('key', self.__name + ' root',
                   self._rawClient.rootPublicKey);
      self.T.thing('key', self.__name + ' longterm',
                   self._rawClient.longtermSigningPublicKey);
      self.T.thing('key', self.__name + ' client',
                   self._rawClient.clientPublicKey);
    });
  },

  signupWith: function(testServerActor) {
    this._usingServer = testServerActor;
    this._rawClient.signupUsingServerSelfIdent(
      this._usingServer.__signedSelfIdentBlob);
  },

  setup_useServer: function setup_useServer(server) {
    var self = this;
    return this.T.convenienceSetup(self._eRawClient, 'creates account with',
                                   server._eServer,
                                   function() {
      self._eRawClient
        .expect_signup_begin()
        .expect_signedUp()
        .expect_signup_end();

      self.signupWith(server);
    });
  },

  /**
   * Create mutual friendship relationships between 'this' client and the
   *  provided clients.
   */
  setup_superFriends: function(friends) {
    var tofriend = friends.concat([this]);
    this.T.convenienceSetup(
      'setup mutual friend relationships among:', tofriend,
    function() {
      // (the destructive mutation is fine)
      while (tofriend.length >= 2) {
        var focal = tofriend.pop();
        for (var i = 0; i < tofriend.length; i++) {
          var other = tofriend[i];
          focal.addContact(other);
          focal._usingServer.expect_XXX();
          other.addContact(focal);
        }
      }
    });
  },

  writeMessage: function(conv, outMsgThing, recipients) {
  },

  replyToMessageWith: function(msgReplyingTo, outMsgThing) {
  },

  expect_receiveMessages: function() {
  },

  inviteToConv: function(recipient, outConvThing) {
    throw new Error("XXX NOT IMPLEMENTED");
  },
};

var SERVER_ROLE_MODULES = {
  auth: {
    apiModule: $authdb_api,
    serverModule: null,
  },
  signup: {
    apiModule: null,
    serverModule: $signup_server,
  }
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

      self.T.thing('key', self.__name + ' root', keyring.rootPublicKey);
      self.T.thing('key', self.__name + ' longterm', keyring.boxingPublicKey);

      var details = {
        tag: 'server:dummy',
        url: 'ws://127.0.0.1:' + self._server.address.port + '/',
      };
      var signedSelfIdent = self.__signedSelfIdentBlob =
        $pubident.generateServerSelfIdent(rootKeyring, keyring, details);

      var serverConfig = self._config = $configurer.__populateTestConfig(
                                         keyring, signedSelfIdent);

      // -- create api's, bind server definitions
      var roles = opts.roles;
      for (var iRole = 0; iRole < roles.length; iRole++) {
        var roleName = roles[iRole];
        var serverRoleInfo = SERVER_ROLE_MODULES[roleName];
        if (serverRoleInfo.apiModule) {
          serverConfig[roleName + 'Api'] =
            new serverRoleInfo.apiModule.Api(self._db);
        }
        if (serverRoleInfo.serverModule) {
          self._server.registerServer(
            serverRoleInfo.serverModule.makeServerDef(serverConfig));
        }
      }
    });
    self.T.convenienceDeferredCleanup(self, 'cleans up, killing', self._eServer,
                                      'shutting down', self._eDb,
                              function() {
      self._server.shutdown();
      $gendb.cleanupTestDBConnection(self._db);

      self._eDb.expect_closed();
      self._db.close();
    });
  },

  assertClientAuthorizationState: function(testClient, isAuthorized) {
    var userRootKey = testClient._rawClient.rootPublicKey;
    this.expect_clientAuthorizationCheck(userRootKey, isAuthorized);

    var self = this;
    when(this._config.authApi.serverCheckUserAccount(userRootKey),
      function(val) {
        self._logger.clientAuthorizationCheck(userRootKey, val);
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
  },
  testServer: {
    // we are a client/server client, even if we are smart for one
    type: $log.TEST_SYNTHETIC_ACTOR,
    subtype: $log.SERVER,

    events: {
      clientAuthorizationCheck: {userRootKey: 'key', isAuthorized: true},
    },
  }
});

console.log("RAWCLIENT IS", $rawclient_api);
exports.TESTHELPER = {
  LOGFAB_DEPS: [LOGFAB,
    $authconn.LOGFAB, $rawclient_api.LOGFAB,
    $signup_server.LOGFAB, $gendb.LOGFAB,
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
