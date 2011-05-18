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
 * Authenticated/encrypted communication using nacl on top of non-TLS
 *  websockets.  The rationale is:
 *
 * @itemize[
 *   @item{
 *     The browser can do websockets, plus it's a framed transport, which is
 *     nice.
 *   }
 *   @item{
 *     We want to avoid bringing certificates and TLS into the picture.  From
 *     an analysis perspective, it's much simpler to just depend on nacl for
 *     our encryption and authentication.  Also, we're trying to build something
 *     that does not depend on the top-down certificate system.  (We could,
 *     obviously, build our crypto on top of certs, although an unprivileged
 *     web client would likely be unable to provide the cert to use to
 *     authenticate...)
 *   }
 *   @item{
 *     Although using the websocket framing which is above the encryption layer
 *     makes it easier to perform traffic analysis, we currently aren't fancy
 *     enough to meaningfully obscure what's going on under the covers anyways.
 *   }
 * ]
 *
 * The general
 * @itemized[
 *   @item{
 *     We establish a websockets connection with a specific URL endpoint.
 *   }
 *   @item{
 *     The client sends a packet identifying itself (key hash), who it
 *     thinks it is talking to (key hash), and NONCELENGTH random bytes.
 *   }
 *   @item{
 *     The server either closes the connection because the client is misguided,
 *     or sends a packet with NONCELENGTH random bytes.
 *   }
 *   @item{
 *     The client boxes a randomly generated secret key using a nonce made up
 *     of the first-half of each of their nonce bytes (client + server).
 *   }
 *   @item{
 *     The server unboxes the secret key, thereby authenticating the client
 *     since nacl boxes have authentication backed in.
 *   }
 *   @item{
 *     Both the client and server use the secret key for transmission.  The
 *     server uses a nonce made up of the second half of the nonce bytes from
 *     the server and client (in that order).  The client uses a nonce made up
 *     from the second half of the nonce bytes from the client and server (in
 *     that order).
 *   }
 * ]
 *
 **/

define(
  [
    'http',
    'q',
    'nacl',
    'websocket/WebSocketClient',
    'websocket/WebSocketServer',
    'rdcommon/log',
    'module',
    'exports'
  ],
  function(
    $http,
    $Q,
    $nacl,
    WebSocketClient,
    WebSocketServer,
    $log,
    $module,
    exports
  ) {

var PROTO_REV = 'deuxdrop-v1';

/**
 * Do not allow a backlog of more than this many messages; terminate the
 *  connection should this number be reached.
 */
var MAX_QUEUED_MESSAGES = 2;

/**
 * Common authenticated/encrypted connection abstraction logic.
 *
 * Provides state management.
 */
var AuthClientCommon = {
  _initCommon: function(initialState) {
    this.connState = initialState;
    this.appConn = null;
    this._pendingPromise = null;
    /**
     * Backlog of messages received while pending on a promise.
     */
    this._queuedMessages = null;

    this._boundHandlerResolved = this._onHandlerResolved.bind(this);
    this._boundHandlerRejected = this._onHandlerReject.bind(this);
  },
  _connected: function(conn) {
    this.log.connected();
    this._conn = conn;
    conn.on('error', this._onError.bind(this));
    conn.on('close', this._onClose.bind(this));
    conn.on('message', this._onMessage.bind(this));
  },

  _onError: function(error) {
  },
  _onClose: function() {
    this._conn = null;
    this.log.close();
  },
  _onMessage: function(wsmsg) {
    var msg;
    if (wsmsg.type === 'utf8') {
      msg = JSON.parse(wsmsg.utf8Data);
    }
    else {
      throw new Error('AuthConn currently should not use binary frames');
    }

    this.log.receive(msg.type, msg);

    if (this._pendingPromise) {
      if (this._queuedMessages == null)
        this._queuedMessages = [msg];
      else if (this._queuedMessages.length >= MAX_QUEUED_MESSAGES) {
        this.log.queueBacklogExceeded();
        this.close();
      }
      else
        this._queuedMessages.push(msg);
    }
    else {
      this._handleMessage(msg);
    }
  },
  _handleMessage: function(msg) {

    var handlerObj, state;
    if (this.connState !== 'app') {
      handlerObj = this;
      state = this.connState;
    }
    else {
      handlerObj = this.appConn;
      state = this.appState;
    }

    var handlerName = '_msg_' + state + '_' + msg.type;
    if (!(handlerName in handlerObj)) {
      this.log.badMessage(msg.type);
      this.close(true);
      return;
    }

    var rval = this.log.handleMsg(msg.type,
                                  handlerObj, handlerObj[handlerName], msg);

    if ($Q.isPromise(rval)) {
      this._pendingPromise = rval;
      $Q.when(this._pendingPromise,
              this._boundHandlerResolved,
              this._boundHandlerRejected);
    }
    else if (typeof(rval) === "string") { // (good return)

    }
    else { // (exception thrown / illegal return case)
      this.handlerFailure(rval);
      this.close(true);
    }
  },
  _onHandlerResolved: function(newstate) {
  },
  _onHandlerRejected: function(err) {
  },

  close: function(isBad) {
    if (this._conn)
      this._conn.close();
  },
};

/**
 * The connection is locally uniquely named by the complex tuple of
 *  ((local IP:local port), (remote IP:remote port)).  The other end of the
 *  connection's log entry can be found by swapping the components of the tuple
 *  (and applying the appropriate host prefix as needed).
 */
function AuthClientConn(clientIdent, serverIdent, url) {
  this.clientIdent = clientIdent;
  this.serverIdent = serverIdent;
  this.url = url;

  this.log = LOGFAB.clientConn();

  this._initCommon('connect');

  var wsc = this._wsClient = new WebSocketClient();
  wsc.on('error', this._onConnectError.bind(this));
  wsc.on('connect', this._onConnected.bind(this));

  wsc.connect(url, [PROTO_REV]);
}
AuthClientConn.prototype = {
  __proto__: AuthClientCommon,

  _onConnectError: function(error) {
  },
  _onConnected: function(conn) {
    this._connected(conn);
    this.log.connState((this.state = 'authServerNonce'));
  },

  //////////////////////////////////////////////////////////////////////////////
  // State Message Handlers

  _msg_authServerNonce_nonce: function(msg) {
  },

  //////////////////////////////////////////////////////////////////////////////
};
exports.AuthClientConn = AuthClientConn;

/**
 * The connection is locally uniquely named by the complex tuple of
 *  ((local IP:local port), (remote IP:remote port)).  The other end of the
 *  connection's log entry can be found by swapping the components of the tuple
 *  (and applying the appropriate host prefix as needed).
 *
 *
 */
function AuthServerConn(serverIdent, rawConn) {
  this.log = LOGFAB.serverConn();

  this._initCommon('authClientIdent');
  this._connected(rawConn);
}
AuthServerConn.prototype = {
  __proto__: AuthClientCommon,

  //////////////////////////////////////////////////////////////////////////////
  // State Message Handlers

  _msg_authClientIdent_clientIdent: function(msg) {
  },

  _msg_authBoxedSecret_boxedSecret: function(msg) {
  },

  //////////////////////////////////////////////////////////////////////////////
};
exports.AuthServerConn = AuthServerConn;

function serve404s(request, response) {
  response.writeHead(404);
  response.end();
}

/**
 * The server is locally uniquely named by the IP address and port it is
 *  listening on.  It is globally uniquely named by prefixing the host
 *  identifier (which is handled by the logging layer).
 */
function AuthorizingServer() {
  this._endpoints = {};

  // That which is not a websocket shall be severely disappointed currently.
  var httpServer = this._httpServer = http.createServer(serve404s);

  var server = this._wsServer = new WebSocketServer();
  server.on('request', this._onRequest.bind(this));

  this.address = null;
}
AuthorizingServer.prototype = {
  _onRequest: function _onRequest(request) {
    if (this._endpoints.hasOwnProperty(request.resource)) {
      var info = this._endpoints[request.resource];

      var rawConn = request.accept(PROTO_REV, request.origin);
      var authConn = new AuthServerConn(info.serverInfo, rawConn);
    }

  },

  _registerEndpoint: function registerEndpoint(path, endpointDef) {
    this._endpoints[path] = endpointDef;
    this.log.endpointRegistered(path);
  },

  registerServer: function registerServer(serverDef) {
    if (!("endpoints" in serverDef))
      throw new Error("A server definition must have endpoints.");
    for (var endpointName in serverDef.endpoints) {
      this._registerEndpoint(endpointName, serverDef.endpoints[endpointName]);
    }
  },

  listen: function(usePort) {
    var self = this;
    function listening() {
      self.address = self._httpServer.address();
      self.log.listening(self.address.address, self.address.port);
    }
    if (usePort)
      this._httpServer.listen(usePort, listening);
    else
      this._httpServer.listen(listening);
  },

  shutdown: function() {
  },
};
exports.AuthorizingServer = AuthorizingServer;


var LOGFAB = exports.LOGFAB = $log.register($module, {
  clientConn: {
    implClass: AuthClientConn,
    type: $log.CONNECTION,
    subtype: $log.CLIENT,
    stateVars: {
      connState: true,
      appState: true,
    },
    events: {
      connect: {},
      connected: {},
      send: {type: true},
      receive: {type: true},
      close: {},
    },
    calls: {
      handleMsg: {type: true},
    },
    errors: {
      badMessage: {type: true},
      queueBacklogExceeded: {},
    },
  },
  serverConn: {
    implClass: AuthServerConn,
    type: $log.CONNECTION,
    subtype: $log.SERVER,
    stateVars: {
      connState: true,
      appState: true,
    },
    events: {
      connected: {},
      send: {type: true},
      receive: {type: true},
      close: {},
    },
    calls: {
      handleMsg: {type: true},
    },
    errors: {
      badMessage: {type: true},
      queueBacklogExceeded: {},
      handlerFailure: {err: true},
    },
  },
  server: {
    implClass: AuthorizingServer,
    type: $log.SERVER,
    events: {
      endpointRegistered: {path: true},
      listening: {address: false, port: false},
      endpointConn: {path: true},
    },
  },
});

}); // end define
