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
    'module',
    'exports'
  ],
  function(
    $authconn,
    $tc,
    $module,
    exports
  ) {

var TD = $tc.defineTestsFor($module, $authconn.LOGFAB);

function TestClientConnection() {
  this._wallowDeferred = null;
}
TestClientConnection.prototype = {
  _initialState: 'root',
  _msg_root_beHappy: function(msg) {
  },
  _msg_root_beSad: function(msg) {
  },
  _msg_happy_beSad: function(msg) {
  },
  _msg_sad_wallow: function(msg) {
    // wallowing is an asynchronous process!
    this._wallowDeferred = $Q.defer();
    return this._wallowDeferred.promise;
  },
  _msg_sad_beHappy: function(msg) {
  },

  stopWallowing: function() {
    this._wallowDeferred.resolve('sad');
    this._wallowDeferred = null;
  },
};

function TestServerConnection() {
}
TestServerConnection.prototype = {
};

var TestServerDef = {
  endpoints: {
    'test/test': {
      implClass: TestServerConnection,
    },
  },
};

TD.commonCase('working loopback authconn connection', function(T) {
  var eClientConn = T.entity('clientConn', 'C'), clientConn;
  var eServerConn = T.entity('serverConn', 'S'), serverConn;
  var eServer = T.entity('server', 'L'), server;

  T.setup(eServer, 'performs setup and listens', function() {
    // (it is implied that eServer is created this step)
    eServer.expect_endpointRegistered('test/test');
    eServer.expect_listening();

    server = new $authconn.AuthorizingServer();
    server.registerServer(TestServerDef);
    server.listen();
  });

  T.action(eClientConn, 'connects to', eServer, 'resulting in', eServerConn,
           function() {
    // (it is implied that eServer and eServerConn are created this step)
    eClientConn.expect_connect();
    eClientConn.expect_connected();
    eServer.expect_endpointConn('test/test');
    eServerConn.expect_connected();

    var url = "http://" + server.address + ":" + server.port + "/test/test";
    clientConn = new TestClientConnection(url);

  });

  T.action(eServerConn, 'says be sad (transition)', eClientConn, function() {
    eServerConn.expect_send('beSad');
    eClientConn.expect_receive('beSad');
    eClientConn.expect_handle('beSad');
    eClientConn.expect_appState('sad');

    serverConn.say('beSad');
  });

  T.action(eServerConn, 'says wallow, be happy (async, queueing)', eClientConn,
           function() {
    eServerConn.expect_send('wallow');
    eServerConn.expect_send('beHappy');
    eClientConn.expect_receive('wallow');
    eClientConn.expect_handle('wallow');
    // (we won't handle it, but be sure that the event happens)
    eClientConn.expect_receive('beHappy');
    eClientConn.expect_appState('sad');

    serverConn.say('wallow');
    serverConn.say('beHappy');
  });

  T.action(eClientConn, 'processes be happy (async resolution, queue proc)',
           function() {
    eClientConn.expect_handle('beHappy');
    eClientConn.expect_appState('happy');

    clientConn.stopWallowing();
  });

  T.permutation('who closes the connection', [
    T.action(eServerConn, 'closes the connection on', eClientConn, function() {
      eServerConn.expect_close();
      eClientConn.expect_close();

      serverConn.close();
    }),
    T.action(eClientConn, 'closes the connection on', eServerConn, function() {
      eClientConn.expect_close();
      eServerConn.expect_close();

      clientConn.close();
    }),
  ]);

  T.cleanup('shutdown', eServerConn, function() {
    server.shutdown();
  });
});

/*
TD.edgeCase('kill connection on queue backlog', function(T) {
});
*/

}); // end define
