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

var LT = $tc.makeTestingContext($module, $authconn.LOGFAB);

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

LT.commonCase('working loopback authconn connection', function(T) {
  var eClient = T.entity('client'), client;
  var eServer = T.entity('server'), server;

  T.action(eServer, 'performs setup and listens', function() {
    server = new $authconn.AuthorizingServer();
  });

  T.action(eClient, 'connects to', eServer, function() {
    client = new TestClientConnection(server.url);

  });

  T.action(eServer, 'says be sad (transition)', eClient, function() {
    eServer.expect_send('beSad');
    eClient.expect_receive('beSad');
    eClient.expect_handle('beSad');
    eClient.expect_appState('sad');

    server.say('beSad');
  });

  T.action(eServer, 'says wallow, be happy (async, queueing)', eClient,
           function() {
    eServer.expect_send('wallow');
    eServer.expect_send('beHappy');
    eClient.expect_receive('wallow');
    eClient.expect_handle('wallow');
    // (we won't handle it, but be sure that the event happens)
    eClient.expect_receive('beHappy');
    eClient.expect_appState('sad');

    server.say('wallow');
    server.say('beHappy');
  });

  T.action(eClient, 'processes be happy (async resolution, queue proc)',
           function() {
    eClient.expect_handle('beHappy');
    eClient.expect_appState('happy');

    client.stopWallowing();
  });

  T.permutation([
    T.action(eServer, 'closes the connection on', eClient, function() {
      eServer.expect_close();
      eClient.expect_close();

      server.close();
    }),
    T.action(eClient, 'closes the connection on', eServer, function() {
      eClient.expect_close();
      eServer.expect_close();

      client.close();
    }),
  ]);

});

/*
LT.edgeCase('kill connection on queue backlog', function(T) {
});
*/

}); // end define
