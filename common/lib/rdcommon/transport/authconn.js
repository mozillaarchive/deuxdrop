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
 *  websockets and cribs the broad strokes used by CurveCP
 *  (http://curvecp.org/packets.html). The rationale is:
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
 *   @item{
 *     CurveCP knows what it is doing (and uses the same crypto), but it is also
 *     a TCP-replacement.  Since we are built on top of TCP, we do not need the
 *     TCP-replacement bits.  We are maintaining the 3-message setup idiom
 *     even though we might be able to get away with 2 (because we don't need
 *     the server cookie protection) because it avoids ever exposing a message
 *     encrypted from or to the client's public key on the wire.  (The
 *     authenticating voucher is passed in a box.)  I honestly have no idea
 *     right now if this is an important property, but if someone told me that
 *     you could infer something about the keys involved in such an operation,
 *     I would not make a shocked-looking face, and so it seems reasonable to
 *     keep for now.  Also, it allows us to confirm everything is good once
 *     the 3rd message is received, whereas we would need to verify the
 *     integrity of the first actual content message (which would be the 3rd
 *     message) under a shortened idiom.
 *
 *     The main deviation on our part is that we currently transmit fully random
 *     24-byte nonces rather than 16-byte nonces with an implied prefix.  We do
 *     this because we're not confident we can/ don't want to have to maintain
 *     proper counter behaviour at this time.
 *   }
 * ]
 *
 * The general protocol is below, using the CurveCP packet doc syntax:
 * @itemized[
 *   @item{
 *     We establish a websockets connection with a specific URL endpoint.
 *   }
 *   @item{
 *     The client generates a new, temporary keypair.  The client sends: [S, C',
 *     random 24-byte nonce, Box[64-bytes of zeroes](C'->S)].
 *
 *     The important thing here is that the client is not identifying itself in
 *     the clear, although it is naming the server identity which we assume to
 *     be known to any eavesdroppers anyways.  (In CurveCP the server identity
 *     is implied by the address and endpoint meta-data.  We might move to
 *     conflating the endpoint with the key at some point, too.)
 *   }
 *   @item{
 *     The server either closes the connection OR it generates its own
 *     temporary keypair and responds with responds with [random 24-byte nonce,
 *     Box[S'](S->C')].
 *   }
 *   @item{
 *     The client either closes the connection OR it responds with
 *     [Box[C, vouchNonce, Box[C'](C->S)](C'->S')].  The nonce used for the
 *     message is a 'C' character followed by binary zero bytes, with each
 *     subsequent client message incrementing the binary bytes in a
 *     little-endian fashion (aka from the left).
 *
 *     Note that the nonce usage differs from CurveCP here.  We prefix a
 *     letter because nonce-requirements demand different nonces whenever
 *     the same set of keys is involved, regardless of the "direction" of the
 *     message between the involved keys.  We don't need to disclose the nonces
 *     in the plaintext because we are already built on top of a reliable
 *     transport and so there is no need to re-order.  We don't need to
 *     support arbitrary increments because there is no clear benefit to
 *     doing so.  Because we have a much larger nonce-space (23 bytes versus 8),
 *     we accordingly do not need to require that the connection be closed
 *     when the nonce counter saturates; instead, we require that the universe
 *     ends before this situation arises.
 *   }
 *   @item{
 *     All server messages from this point on look the same.
 *     [Box[Message](S'->C')] using a strictly-incrementing little-endian
 *     binary number starting from 0 and prefixed by a 'S' character.
 *   }
 * ]
 *
 **/

define(
  [
    'http',
    'q',
    'nacl',
    'websocket',
    'rdcommon/log',
    'module',
    'exports'
  ],
  function(
    $http,
    $Q,
    $nacl,
    $ws,
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

var ZEROES_8 = '\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000';
var ZEROES_16 = ZEROES_8 + ZEROES_8;
var ZEROES_64 = ZEROES_16 + ZEROES_16 + ZEROES_16 + ZEROES_16;

var ZEROES_23 = ZEROES_8 + ZEROES_8 + ZEROES_8.substring(0, 7);
var INITIAL_CLIENT_NONCE = 'C' + ZEROES_23;
var INITIAL_SERVER_NONCE = 'S' + ZEROES_23;

var ZERO = '\u0000';

/**
 * Increment our increasing nonces.
 *
 * This would really like to using mutable data structures like a buffer or
 *  JS typed arrays, but we're punting on that for now.
 */
function incNonce(old) {
  var nonce = old.substring(0, 1);
  for(var i=1; i < 24; i++) {
    var bval = old.charAt(i), nval;
    if (bval == 255) {
      nval += ZERO;
      continue;
    }
    else {
      nval = bval + 1;
      nonce += String.fromCharCode(nval);
      break;
    }
  }
  if (i < 24)
    nonce += old.substring(i);
  return nonce;
}

var MAGIC_CLOSE_MARKER = {};

/**
 * Common authenticated/encrypted connection abstraction logic.
 *
 * Provides state management.
 */
var AuthClientCommon = {
  _initCommon: function(initialState, myNextNonce, otherNextNonce) {
    this.connState = initialState;
    this.appConn = null;
    this._pendingPromise = null;
    this._ephemKeyPair = null;
    this._otherPublicKey = null;

    this._myNextNonce = myNextNonce;
    this._otherNextNonce = otherNextNonce;

    /**
     * Backlog of messages received while pending on a promise.
     */
    this._queuedMessages = null;

    this._boundHandlerResolved = this._onHandlerResolved.bind(this);
    this._boundHandlerRejected = this._onHandlerRejected.bind(this);
  },
  _connected: function(conn) {
    this.log.connected();
    this._conn = conn;
    conn.on('error', this._onError.bind(this));
    conn.on('close', this._onClose.bind(this));
    conn.on('message', this._onMessage.bind(this));

    this._ephemKeyPair = $nacl.box_keypair();
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
      // app frames and the vouch frame are binary.
      if (this.connState === 'app' && this.connState !== 'authClientVouch') {
        this.log.badProto();
        this.close();
        return;
      }
      msg = JSON.parse(wsmsg.utf8Data);
    }
    else {
      var expNonce = this._otherNextNonce;
      msg = $nacl.box_open(wsmsg.binaryData, expNonce,
                           this._otherPublicKey, this._ephemKeyPair.sk);
      if (msg == null) {
        this.log.corruptBox();
        this.close();
        return;
      }
      this._otherNextNonce = incNonce(this._otherNextNonce);
    }

    this.log.receive(msg.type, msg);

    if (this._pendingPromise) {
      if (this._queuedMessages == null) {
        this._queuedMessages = [msg];
      }
      else if (this._queuedMessages.length >= MAX_QUEUED_MESSAGES) {
        this.log.queueBacklogExceeded();
        this.close();
      }
      else {
        this._queuedMessages.push(msg);
      }
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

    if (rval === MAGIC_CLOSE_MARKER) {
      // good, nothing to do.
    }
    if ($Q.isPromise(rval)) {
      this._pendingPromise = rval;
      $Q.when(this._pendingPromise,
              this._boundHandlerResolved,
              this._boundHandlerRejected);
    }
    else if (typeof(rval) === "string") { // (good return)
      this.appState = rval;
    }
    else { // (exception thrown / illegal return case)
      this.log.handlerFailure(rval);
      this.close(true);
    }
  },
  _onHandlerResolved: function(newstate) {
    if (newstate === MAGIC_CLOSE_MARKER) {
      return;
    }
    else if (typeof(newstate) !== "string") {
      this._onHandlerRejected(newstate);
      return;
    }

    this.appState = newstate;
  },
  _onHandlerRejected: function(err) {
    this.log.handlerFailure(err);
    this.close(true);
  },

  close: function(isBad) {
    if (this._conn)
      this._conn.close();
    return MAGIC_CLOSE_MARKER;
  },

  _writeRaw: function(obj) {
    this._conn.sendUTF(JSON.stringify(obj));
  },

  writeMessage: function(obj) {
    var jsonMsg = JSON.stringify(obj);
    var nonce = this._myNextNonce;
    var boxedJsonMsg = $nacl.box(jsonMsg, nonce, this._otherPublicKey,
                                 this._ephemKeyPair.sk);
    this._conn.sendBytes(boxedJsonMsg);

    this._myNextNonce = incNonce(this._myNextNonce);
  },
};

/**
 * The connection is locally uniquely named by the complex tuple of
 *  ((local IP:local port), (remote IP:remote port)).  The other end of the
 *  connection's log entry can be found by swapping the components of the tuple
 *  (and applying the appropriate host prefix as needed).
 */
function AuthClientConn(appConn, clientIdent, serverIdent, url, endpoint) {
  this.appConn = appConn;
  this.clientIdent = clientIdent;
  this.serverIdent = serverIdent;
  this.url = url;
  this.endpoint = endpoint;

  this.log = LOGFAB.clientConn(this, null,
                               [clientIdent.publicKey, 'to',
                                serverIdent.publicKey,
                                'at endpoint', endpoint]);

  this._initCommon('connect',
                   INITIAL_CLIENT_NONCE, INITIAL_SERVER_NONCE);

  var wsc = this._wsClient = new $ws.WebSocketClient();
  wsc.on('error', this._onConnectError.bind(this));
  wsc.on('connectFailed', this._onConnectFailed.bind(this));
  wsc.on('connect', this._onConnected.bind(this));

  this.log.connecting(url);
  wsc.connect(url, [endpoint]);
}
AuthClientConn.prototype = {
  __proto__: AuthClientCommon,

  _onConnectError: function(error) {
    this.log.connectError(error);
  },
  _onConnectFailed: function(error) {
    this.log.connectFailed(error);
  },
  _onConnected: function(conn) {
    this._connected(conn);
    this.log.connState((this.state = 'authServerKey'));

    // send [S, C', nonce, Box[64-bytes of zeroes](C'->S)]
    var nonce = $nacl.box_random_nonce();
    var boxedZeroes = $nacl.box(ZEROES_64, nonce, this.serverIdent.publicKey,
                                this._ephemKeyPair.sk);
    this._writeRaw({
      type: "key",
      serverKey: this.serverIdent.publicKey,
      clientEphemeralKey: this._ephemKeyPair.pk,
      nonce: nonce,
      boxedZeroes: boxedZeroes
    });
  },

  //////////////////////////////////////////////////////////////////////////////
  // State Message Handlers

  _msg_authServerKey_key: function(msg) {
    var ephemKey = $nacl.box_open(msg.boxedEphemeralKey, msg.nonce,
                                  this.serverIdent.publicKey,
                                  this._ephemKeyPair.sk);
    if (!ephemKey) {
      this.log.corruptServerEphemeralKey();
      return this.close();
    }
    this._otherPublicKey = msg.ephemKey;

    // -- send [Box[C, vouchNonce, Box[C'](C->S)](C'->S')]
    var nonce = $nacl.box_random_nonce();
    var boxedVoucher = $nacl.box(this._ephemKeyPair.pk, nonce,
                                 this._otherPublicKey,
                                 this.clientIdent.secretKey);
    this.writeMessage({
      type: "vouch",
      clientKey: this.clientIdent.publicKey,
      nonce: nonce,
      boxedVoucher: boxedVoucher
    });
    return 'app';
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
function AuthServerConn(serverIdent, endpoint, rawConn, authVerifier,
                        _parentLogger) {
  this.appConn = null;
  this.serverIdent = serverIdent;
  this.clientIdent = null;
  this.endpoint = endpoint;

  this.log = LOGFAB.serverConn(this, _parentLogger,
                               [serverIdent.publicKey,
                                'on endpoint', endpoint]);
  this._authVerifier = authVerifier;

  this._initCommon('authClientKey',
                   INITIAL_SERVER_NONCE, INITIAL_CLIENT_NONCE);
  this._connected(rawConn);
}
AuthServerConn.prototype = {
  __proto__: AuthClientCommon,

  //////////////////////////////////////////////////////////////////////////////
  // State Message Handlers

  _msg_authClientKey_key: function(msg) {
    if (msg.serverKey !== this.serverIdent.publicKey) {
      this.log.wrongServer();
      return this.close();
    }
    // We just care that the boxed zeroes authenticate with the key, not that
    //  what's inside is zeroes...
    if (!$nacl.box_open(msg.boxedZeroes, msg.nonce, msg.clientEphemeralKey,
                        this.serverIdent.privateKey)) {
      this.log.corruptClientEphemeralKey();
      this.close();
      return this.close();
    }
    this._otherPublicKey = msg.clientEphemeralKey;

    // -- send [nonce, Box[S'](S->C')].
    var nonce = $nacl.box_random_nonce();
    var boxedEphemeralKey = $nacl.box(this._ephemKeyPair.pk, nonce,
                                      this._otherPublicKey,
                                      this.serverIdent.privateKey);
    this._writeRaw({
      type: "key",
      nonce: nonce,
      boxedEphemeralKey: boxedEphemeralKey,
    });

    return 'authClientVouch';
  },

  _msg_authClientVouch_vouch: function(msg) {
    var ephemCheck = $nacl.box_open(msg.boxedVoucher, msg.nonce,
                                    msg.clientKey, this.serverIdent.secretKey);
    if (ephemCheck !== this._otherPublicKey) {
      this.log.badVoucher();
      return this.close();
    }
    this.clientIdent = {publicKey: msg.clientKey};

    var self = this;
    return when(this._authVerifier(endpoint, this.clientIdent.publicKey),
                function(isgood) {
      if (!isgood) {
        return self.close();
      }
      self.log.__updateIdent([self.serverIdent.publicKey,
                              'on endpoint', self.endpoint,
                              'with client', self.clientIdent.publicKey]);
      self.log.endpointConn(self.endpoint);
      return 'app';
    });
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
console.log("instantiating server");
  this._endpoints = {};

  this.log = LOGFAB.server(this, null, []);

  // That which is not a websocket shall be severely disappointed currently.
  var httpServer = this._httpServer = $http.createServer(serve404s);

  var server = this._wsServer = new $ws.WebSocketServer({
    httpServer: httpServer,
  });
  server.on('request', this._onRequest.bind(this));

  this.address = null;
console.log("constructor completed.");
}
AuthorizingServer.prototype = {
  _onRequest: function _onRequest(request) {
    if (request.requestedProtocols.length != 1) {
      this.log.badRequest("['" + request.requestedProtocols.join("', '") + "']");
      request.reject(500, "USE EXACTLY ONE PROTOCOL!");
      return;
    }
    var protocol = request.requestedProtocols[0];

    this.log.request(protocol);
    if (this._endpoints.hasOwnProperty(protocol)) {
      var info = this._endpoints[protocol];

      var rawConn = request.accept(protocol, request.origin);
      var authConn = new AuthServerConn(info.serverIdent, protocol, rawConn,
                                        info.authVerifier, this.log);
      return;
    }
    this.log.badRequest("['" + protocol + "']");
    request.reject(404, "NO SUCH ENDPOINT.");
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

  listen: function(useIP, usePort) {
    if (useIP === undefined)
      useIP = '127.0.0.1';
    if (usePort === undefined)
      usePort = 0;
    var self = this;
    function listening() {
      self.address = self._httpServer.address();
      self.log.__updateIdent(["server on",
                              self.address.address + ":" + self.address.port]);
      self.log.listening();
    }
    this._httpServer.listen(usePort, useIP, listening);
  },

  shutdown: function() {
  },
};
exports.AuthorizingServer = AuthorizingServer;


var LOGFAB = exports.LOGFAB = $log.register($module, {
  clientConn: {
    //implClass: AuthClientConn,
    type: $log.CONNECTION,
    subtype: $log.CLIENT,
    semanticIdent: {
      clientIdent: 'key',
      _l1: null,
      serverIdent: 'key',
      _l2: null,
      endpoint: 'endpoint',
    },
    stateVars: {
      connState: true,
      appState: true,
    },
    events: {
      connecting: {fullUrl: false},
      connected: {},
      send: {type: true},
      receive: {type: true},
      close: {},
    },
    calls: {
      handleMsg: {type: true},
    },
    errors: {
      connectError: {error: false},
      connectFailed: {error: false},

      corruptServerEphemeralKey: {},

      badProto: {},
      corruptBox: {},

      badMessage: {type: true},
      queueBacklogExceeded: {},
      handlerFailure: {err: $log.EXCEPTION},
    },
  },
  serverConn: {
    //implClass: AuthServerConn,
    type: $log.CONNECTION,
    subtype: $log.SERVER,
    semanticIdent: {
      serverIdent: 'key',
      _l1: null,
      endpoint: 'endpoint',
      _l2: null,
      clientIdent: 'key',
    },
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
      // semantic failures in connection establishment
      wrongServer: {},
      corruptClientEphemeralKey: {},
      badVoucher: {},
      authFailed: {},

      // low level protocol failures: wrong frame type
      badProto: {},
      corruptBox: {},

      badMessage: {type: true},
      queueBacklogExceeded: {},
      handlerFailure: {err: $log.EXCEPTION},
    },
  },
  server: {
    //implClass: AuthorizingServer,
    type: $log.SERVER,
    events: {
      endpointRegistered: {path: true},
      listening: {},

      request: {protocol: true},
      endpointConn: {path: true},
    },
    errors: {
      badRequest: {resource: true},
    },
  },
});

}); // end define
