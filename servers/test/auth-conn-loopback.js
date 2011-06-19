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

define(
  [
    'rdcommon/transport/authconn',
    'rdcommon/testcontext',
    'rdcommon/crypto/keyring',
    'rdservers/configurer',
    'q',
    'module',
    'exports'
  ],
  function(
    $authconn,
    $tc,
    $keyring,
    $configurer,
    $Q,
    $module,
    exports
  ) {
console.error("I AM IN A FILE, MY $authconn IS", $authconn);
var TD = exports.TD = $tc.defineTestsFor($module, $authconn.LOGFAB);

/**
 * Test connection implementation with no logging layer of its own because
 *  this implementation is not under test.
 */
function TestClientConnection(clientKeyring, serverPublicKey, url, endpoint) {
  this._wallowDeferred = null;

  this.conn = new $authconn.AuthClientConn(this, clientKeyring, serverPublicKey,
                                           url, endpoint);
  // a real impl class would insantiate its logger at this point using a
  //  parent logger of "this.conn.log"
}
TestClientConnection.prototype = {
  INITIAL_STATE: 'root',
  _msg_root_beHappy: function(msg) {
    return 'happy';
  },
  _msg_root_beSad: function(msg) {
    return 'sad';
  },
  _msg_happy_beSad: function(msg) {
    return 'sad';
  },
  _msg_sad_wallow: function(msg) {
    // wallowing is an asynchronous process!
    this._wallowDeferred = $Q.defer();
    return this._wallowDeferred.promise;
  },
  _msg_sad_beHappy: function(msg) {
    return 'happy';
  },

  stopWallowing: function() {
    this._wallowDeferred.resolve('sad');
    this._wallowDeferred = null;
  },
};

var TEST_SERVER_CONN = null;
function TestServerConnection(conn) {
  this.conn = conn;

  // XXX make this less horrible when we grow the test framework
  TEST_SERVER_CONN = this;
}
TestServerConnection.prototype = {
  INITIAL_STATE: 'root',
  say: function(what) {
    this.conn.writeMessage({type: what});
  }
};

TD.commonCase('working loopback authconn connection', function(T) {
  var eClientConn = T.actor('clientConn', 'C'), clientConn;
  var eServerConn = T.actor('serverConn', 'S'), serverConn;
  var eServer = T.actor('server', 'L'), server;

  var serverRootRing, serverKeyring, serverConfig;
  var personRootRing, personLongTermRing, personKeyring,
      clientKeyring;

  T.setup(eServer, 'performs setup and listens', function() {
    // (it is implied that eServer is created this step)
    eServer.expect_endpointRegistered('test/test');
    eServer.expect_listening();

    // -- create keyrings
    // XXX this really needs to go in some test helping logic
    serverRootRing = $keyring.createNewServerRootKeyring();
    serverKeyring = serverRootRing.issueLongtermBoxingKeyring();
    serverConfig = $configurer.__populateTestConfig(serverKeyring, null);

    personRootRing = $keyring.createNewPersonRootKeyring();
    personLongTermRing = personRootRing.issueLongtermSigningKeyring();
    personKeyring = personLongTermRing.makeDelegatedKeyring();
    personKeyring.incorporateKeyGroup(
      personLongTermRing.issueKeyGroup('client', {conn: 'box'}));

    clientKeyring = personKeyring.exposeSimpleBoxingKeyringFor("client",
                                                               "connBox");

    var TestServerDef = {
      endpoints: {
        'test/test': {
          implClass: TestServerConnection,
          serverConfig: serverConfig,
          authVerifier: function(endpoint, clientKey) {
            return (clientKey === clientKeyring.boxingPublicKey);
          }
        },
      },
    };

    server = new $authconn.AuthorizingServer();
    server.registerServer(TestServerDef);
    server.listen();
  });

  T.action(eClientConn, 'connects to', eServer, 'resulting in', eServerConn,
           function() {
    // (it is implied that eServer and eServerConn are created this step)
    eClientConn.expect_connecting();
    eServer.expect_request('test/test');
    eServerConn.expect_connected();

    eClientConn.expect_connected();
    eClientConn.expect_connState('authServerKey');
    eClientConn.expect_send('key');

    eServerConn.expect_receive('key');
    eServerConn.expect_handleMsg('key');
    eServerConn.expect_send('key');
    eServerConn.expect_connState('authClientVouch');

    eClientConn.expect_receive('key');
    eClientConn.expect_handleMsg('key');
    eClientConn.expect_send('vouch');
    eClientConn.expect_connState('app');

    eServerConn.expect_receive('vouch');
    eServerConn.expect_handleMsg('vouch');

    eServer.expect_endpointConn('test/test');

    eServerConn.expect_connState('app');

    var url = "ws://" + server.address.address + ":" + server.address.port + "/";
    var endpoint = "test/test";
    clientConn = new TestClientConnection(clientKeyring,
                                          serverKeyring.boxingPublicKey,
                                          url, endpoint);

  });

  T.action(eServerConn, 'says be sad (transition) to', eClientConn, function() {
    eServerConn.expect_send('beSad');

    eClientConn.expect_receive('beSad');
    eClientConn.expect_handleMsg('beSad');
    eClientConn.expect_appState('sad');

    // XXX this is safe but horrible; fix when we grow the framework
    serverConn = TEST_SERVER_CONN;
    serverConn.say('beSad');
  });

  T.action(eServerConn, 'says wallow, be happy (async, queueing) to',
           eClientConn, function() {
    eServerConn.expect_send('wallow');
    eServerConn.expect_send('beHappy');
    eClientConn.expect_receive('wallow');
    eClientConn.expect_handleMsg('wallow');
    // (we won't handle it, but be sure that the event happens)
    eClientConn.expect_receive('beHappy');

    serverConn.say('wallow');
    serverConn.say('beHappy');
  });

  T.action(eClientConn, 'processes be happy (async resolution, queue proc)',
           function() {
    // when wallowing is completed, the sad state will be set again
    eClientConn.expect_appState('sad');
    // and then beHappy will be dequeued
    eClientConn.expect_handleMsg('beHappy');
    eClientConn.expect_appState('happy');

    clientConn.stopWallowing();
  });

  // XXX no permutations yet; baby steps!
  /*
  T.permutation('who closes the connection', [
    T.action(eServerConn, 'closes the connection on', eClientConn, function() {
      eServerConn.expect_close();
      eClientConn.expect_close();

      serverConn.close();
    }),*/
    T.action(eClientConn, 'closes the connection on', eServerConn, function() {
      // the side we are invoking close on sees a 'closing' event
      eClientConn.expect_closing();
      eClientConn.expect_closed();

      // whereas the other side just gets a surprise (aka no closing)
      eServerConn.expect_closed();

      clientConn.conn.close();
    })/*,
  ])*/;

  T.cleanup('shutdown', eServerConn, function() {
    if (server) {
      server.shutdown();
      server = null;
    }
  });
});

/*
TD.edgeCase('kill connection on queue backlog', function(T) {
});
*/

}); // end define
