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
 * The general protocol is below, using the CurveCP packet doc syntax.  Keep in
 * mind that all keys are (signcryption) boxing keys and not signing keys.
 *
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
    'http', // (for server role stuff)
    'q',
    'nacl',
    'websocket',
    'rdcommon/log',
    'rdcommon/taskidiom',
    'module',
    'exports'
  ],
  function(
    $http,
    $Q,
    $nacl,
    $ws,
    $log,
    $task,
    $module,
    exports
  ) {
var when = $Q.when;

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
 *
 * XXX I have verified this works for incrementing at least one byte, but
 *  this needs a functional test.
 */
function incNonce(old) {
  var nonce = old.substring(0, 1);
  for(var i=1; i < 24; i++) {
    var bval = old.charCodeAt(i);
    if (bval === 255) {
      nonce += ZERO;
      continue;
    }
    else {
      nonce += String.fromCharCode(bval + 1);
      i++;
      break;
    }
  }
  if (i < 24)
    nonce += old.substring(i);
  return nonce;
}

/*
 * XXX gecko-related hack.  We need to send our binary data in websocket text
 *  frames because the gecko websockets implementation does not support binary
 *  frames.  We are experiencing failures when marshaling the data naively,
 *  suggesting that I need to deep dive on the utf8 conversion, but time is
 *  short.  I briefly tried an explicit utf8 'expansion' so that our binary
 *  representations would take on legal forms, but that outright broke, so we're
 *  roundtripping through base64 for now.
 */
var transitHackBinary, unTransitHackBinary;
if (!$ws.GECKO) {
  // node.js case
  transitHackBinary = function(binString) {
    // interpret the string as binary data when converting to octets
    var buf = new Buffer(binString, 'binary');
    return buf.toString('base64');
  };
  unTransitHackBinary = function(utf8String) {
    var buf = new Buffer(utf8String, 'base64');
    return buf.toString('binary');
  };
}
else {
  // gecko case
  transitHackBinary = function(s) {
    return $ws.helpers.btoa(s);
  };
  unTransitHackBinary = function(s) {
    return $ws.helpers.atob(s);
  };
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
    this.log.websocketError(error);
  },
  _onClose: function() {
    if (this._conn === null)
      return;
    this._conn = null;
    this.log.closed();

    if (this.appConn && ("__closed" in this.appConn)) {
      var rval = this.log.appCloseHandler(this.appConn,
                                          this.appConn.__closed);
      // if an exception is thrown, kill the connection
      if (rval instanceof Error) {
        this.log.handlerFailure(rval);
      }
    }

    this.log.__die();
  },
  /**
   * Receive an incoming message, decrypt/verify it, and either enqueue it
   *  or immediately handle it.  A message is enqueued if a previous handler
   *  returned a promise that it has not yet been resolved/rejected.  A
   *  finite number of messages are allowed to be enqueued
   *  (`MAX_QUEUED_MESSAGES`); the connection will automatically be closed
   *  when a message is received and the queue is already full.
   */
  _onMessage: function(wsmsg) {
    var msg;
    // XXX Gecko's websockets can't do binary frames right now
    if (wsmsg.utf8Data[0] === 'T') { // (wsmsg.type === 'utf8') {
      // app frames and the vouch frame are binary.
      if (this.connState === 'app' && this.connState !== 'authClientVouch') {
        this.log.badProto();
        this.close();
        return;
      }
      msg = JSON.parse(wsmsg.utf8Data.substring(1));
    }
    else {
      var expNonce = this._otherNextNonce,
          // XXX gecko issues... was: wsmsg.binaryData
          data = unTransitHackBinary(wsmsg.utf8Data.substring(1));
      try {
        msg = $nacl.box_open(data, expNonce,
                             this._otherPublicKey, this._ephemKeyPair.sk);
      }
      catch(ex) {
        this.log.corruptBox();
        this.close();
        return;
      }
      this._otherNextNonce = incNonce(this._otherNextNonce);

      msg = JSON.parse(msg);
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
  /**
   * Handle a message
   */
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
      this.log.badMessage(state, msg.type);
      this.close(true);
      return;
    }

    var rval = this.log.handleMsg(msg.type,
                                  handlerObj, handlerObj[handlerName], msg);

    if (rval === MAGIC_CLOSE_MARKER) {
      // good, nothing to do.
    }
    else if ($Q.isPromise(rval)) {
      this._pendingPromise = rval;
      when(this._pendingPromise,
           this._boundHandlerResolved,
           this._boundHandlerRejected);
    }
    else if (typeof(rval) === "object" &&
             $task.TaskProto.isPrototypeOf(rval)) {
      when(rval.run(), this._boundHandlerResolved, this._boundHandlerRejected);
    }
    else if (typeof(rval) === "string") { // (good return)
      if (this.connState !== 'app')
        this.log.connState((this.connState = rval));
      else
        this.log.appState((this.appState = rval));
    }
    else { // (exception thrown / illegal return case)
      this.log.handlerFailure(rval);
      this.close(true);
    }
  },
  _onHandlerResolved: function(newstate) {
    this._pendingPromise = null;
    if (newstate === MAGIC_CLOSE_MARKER) {
      return;
    }
    else if (typeof(newstate) !== "string") {
      this._onHandlerRejected(newstate);
      return;
    }

    if (this.connState !== 'app')
      this.log.connState((this.connState = newstate));
    else
      this.log.appState((this.appState = newstate));
    // If there are any queued messages, handle them until we run out or one
    //  of them goes async.
    while (this._queuedMessages && this._queuedMessages.length &&
           this._pendingPromise === null) {
      this._handleMessage(this._queuedMessages.shift());
    }
  },
  _onHandlerRejected: function(err) {
    this._pendingPromise = null;
    this.log.handlerFailure(err);
    this.close(true);
  },

  close: function(isBad) {
    this.log.closing(Boolean(isBad));
    if (this._conn)
      this._conn.close();
    return MAGIC_CLOSE_MARKER;
  },

  _writeRaw: function(obj) {
    this.log.send(obj.type, obj);
    // XXX prefixing because of gecko websocket limitations (no binary frames)
    this._conn.sendUTF('T' + JSON.stringify(obj));
  },

  writeMessage: function(obj) {
    this.log.send(obj.type, obj);
    var jsonMsg = JSON.stringify(obj);
    var nonce = this._myNextNonce;
    var boxedJsonMsg = $nacl.box(jsonMsg, nonce, this._otherPublicKey,
                                 this._ephemKeyPair.sk);
    // XXX Gecko's websockets only supports DOMStrings right now...
    /*
    // it wants a buffer...
    var buf = new Buffer(boxedJsonMsg, 'binary');
    this._conn.sendBytes(buf);
    */
    this._conn.sendUTF('B' + transitHackBinary(boxedJsonMsg));

    this._myNextNonce = incNonce(this._myNextNonce);
  },
};

/**
 * Authenticated client connection.
 */
function AuthClientConn(appConn, clientKeyring, serverPublicKey,
                        url, endpoint, _logger) {
  this.appConn = appConn;
  this.appState = appConn.INITIAL_STATE;
  this.clientKeyring = clientKeyring;
  this.serverPublicKey = serverPublicKey;
  this.url = url;
  this.endpoint = endpoint;

  this.log = LOGFAB.clientConn(this, _logger,
                               [clientKeyring.boxingPublicKey, 'to',
                                serverPublicKey,
                                'at endpoint', endpoint]);

  this._initCommon('connect',
                   INITIAL_CLIENT_NONCE, INITIAL_SERVER_NONCE);

  // XXX forcing a super-short timeout because we don't care about close frames
  //  and we are experiencing odd issues when simultaneously closing...
  var wsc = this._wsClient = new $ws.WebSocketClient({closeTimeout: 0});
  wsc.on('error', this._onConnectError.bind(this));
  wsc.on('connectFailed', this._onConnectFailed.bind(this));
  wsc.on('connect', this._onConnected.bind(this));

  this.log.connecting(url);
  wsc.connect(url, [endpoint]);
}
AuthClientConn.prototype = {
  __proto__: AuthClientCommon,
  toJSON: function() {
    return {
      type: 'AuthClientConn',
      endpoint: this.endpoint,
    };
  },

  _onConnectError: function(error) {
    this.log.connectError(error);
  },
  _onConnectFailed: function(error) {
    this.log.connectFailed(error);
  },
  _onConnected: function(conn) {
    this._connected(conn);
    this.log.__updateIdent([this.clientKeyring.boxingPublicKey, 'to',
                            this.serverPublicKey,
                            'at endpoint', this.endpoint,
                            'on port', this._conn.socket.address().port]);
    this.log.connState((this.connState = 'authServerKey'));

    // send [S, C', nonce, Box[64-bytes of zeroes](C'->S)]
    var nonce = $nacl.box_random_nonce();
    var boxedZeroes = $nacl.box(ZEROES_64, nonce, this.serverPublicKey,
                                this._ephemKeyPair.sk);
    this._writeRaw({
      type: "key",
      serverKey: this.serverPublicKey,
      clientEphemeralKey: this._ephemKeyPair.pk,
      nonce: nonce,
      boxedZeroes: boxedZeroes
    });
  },

  //////////////////////////////////////////////////////////////////////////////
  // State Message Handlers

  _msg_authServerKey_key: function(msg) {
    var ephemKey;
    try {
      ephemKey = $nacl.box_open(msg.boxedEphemeralKey, msg.nonce,
                                this.serverPublicKey,
                                this._ephemKeyPair.sk);
    }
    catch(ex) {
      this.log.corruptServerEphemeralKey();
      return this.close();
    }
    this._otherPublicKey = ephemKey;

    // -- send [Box[C, vouchNonce, Box[C'](C->S)](C'->S')]
    var nonce = $nacl.box_random_nonce();
    var boxedVoucher = this.clientKeyring.box(this._ephemKeyPair.pk, nonce,
                                              this.serverPublicKey);
    this.writeMessage({
      type: "vouch",
      clientKey: this.clientKeyring.boxingPublicKey,
      nonce: nonce,
      boxedVoucher: boxedVoucher
    });
    // (transition to application space; no more protocol stuff to do)
    // -- invoke any on-connected handler...
    if ("__connected" in this.appConn) {
      var rval = this.log.appConnectHandler(this.appConn,
                                            this.appConn.__connected);
      // if an exception is thrown, kill the connection
      if (rval instanceof Error) {
        this.log.handlerFailure(rval);
        this.close(true);
        return MAGIC_CLOSE_MARKER;
      }
    }
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
function AuthServerConn(serverConfig, endpoint,
                        rawConn, authVerifier,
                        implClass, owningServer, _parentLogger) {
  this.appConn = null;
  this.appState = null;
  this.serverConfig = serverConfig;
  this.serverKeyring = serverConfig.keyring;
  this.clientPublicKey = null;
  this.endpoint = endpoint;

  this._implClass = implClass;
  this._owningServer = owningServer;
  this.log = LOGFAB.serverConn(this, _parentLogger,
                               [this.serverKeyring.boxingPublicKey,
                                'on endpoint', endpoint]);
  this._authVerifier = authVerifier;

  this._initCommon('authClientKey',
                   INITIAL_SERVER_NONCE, INITIAL_CLIENT_NONCE);
  this._connected(rawConn);
}
AuthServerConn.prototype = {
  __proto__: AuthClientCommon,
  toJSON: function() {
    return {
      type: 'AuthServerConn',
      endpoint: this.endpoint,
    };
  },

  //////////////////////////////////////////////////////////////////////////////
  // State Message Handlers

  _msg_authClientKey_key: function(msg) {
    if (msg.serverKey !== this.serverKeyring.boxingPublicKey) {
      this.log.wrongServer();
      return this.close();
    }
    // We just care that the boxed zeroes authenticate with the key, not that
    //  what's inside is zeroes...
    try {
      this.serverKeyring.openBox(msg.boxedZeroes, msg.nonce,
                                 msg.clientEphemeralKey);
    }
    catch (ex) {
      this.log.corruptClientEphemeralKey();
      return this.close();
    }
    this._otherPublicKey = msg.clientEphemeralKey;

    // -- send [nonce, Box[S'](S->C')].
    var nonce = $nacl.box_random_nonce();
    var boxedEphemeralKey = this.serverKeyring.box(this._ephemKeyPair.pk, nonce,
                                                   this._otherPublicKey);

    this._writeRaw({
      type: "key",
      nonce: nonce,
      boxedEphemeralKey: boxedEphemeralKey,
    });

    return 'authClientVouch';
  },

  _msg_authClientVouch_vouch: function(msg) {
    var ephemCheck;
    // this can fail 2 ways:
    // - the box is not properly formed (wrong keys, gibberish) => exception
    try {
      ephemCheck = this.serverKeyring.openBox(msg.boxedVoucher, msg.nonce,
                                              msg.clientKey);
    }
    catch(ex) {
      this.log.badProto();
      return this.close();
    }
    // - the box is talking about the wrong key
    if (ephemCheck !== this._otherPublicKey) {
      this.log.badVoucher();
      return this.close();
    }
    this.clientPublicKey = msg.clientKey;

    var self = this;
    return when(this._authVerifier(this.endpoint, this.clientPublicKey),
                function(authResult) {
      if (!authResult) {
        self.log.authFailed();
        return self.close();
      }
      self.log.__updateIdent([self.serverKeyring.boxingPublicKey,
                              'on endpoint', self.endpoint,
                              'with client', self.clientPublicKey,
                              'on port', self._conn.socket.remotePort]);
      self._owningServer.__endpointConnected(self, self.endpoint);

      self.appConn = new self._implClass(self, authResult);
      self.appState = self.appConn.INITIAL_STATE;
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
function AuthorizingServer(_logger, extraNaming) {
console.log("instantiating server");
  this._endpoints = {};

  this._extraNaming = extraNaming || "server";
  this.log = LOGFAB.server(this, _logger, [this._extraNaming]);

  // That which is not a websocket shall be severely disappointed currently.
  var httpServer = this._httpServer = $http.createServer(serve404s);

  var server = this._wsServer = new $ws.WebSocketServer({
    httpServer: httpServer,
    // XXX see the client for our logic on using a zero close timeout.
    closeTimeout: 0,
  });
  server.on('request', this._onRequest.bind(this));

  this.address = null;
console.log("constructor completed.");
}
AuthorizingServer.prototype = {
  toJSON: function() {
    return {
      type: 'AuthorizingServer',
    };
  },

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
      var authConn = new AuthServerConn(info.serverConfig, protocol,
                                        rawConn, info.authVerifier,
                                        info.implClass, this, this.log);
      return;
    }
    this.log.badRequest("['" + protocol + "']");
    request.reject(404, "NO SUCH ENDPOINT.");
  },

  /**
   * Used by a connection to tell us that it has completed establishing a
   *  connection.  It tells us this so that in the future we can fight bad
   *  actors by distinguishing good connections from bad connections.  Right
   *  now this just generates a log event that is vaguely interesting.
   */
  __endpointConnected: function(conn, endpoint) {
    this.log.endpointConn(endpoint);
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
      self.log.__updateIdent([self._extraNaming, "on",
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
    type: $log.CONNECTION,
    subtype: $log.CLIENT,
    semanticIdent: {
      clientIdent: 'client',
      _l1: null,
      serverIdent: 'server',
      _l2: null,
      endpoint: 'type',
      _l3: null,
      port: 'unique',
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
      closing: {},
      closed: {},
    },
    TEST_ONLY_events: {
      send: {msg: $log.JSONABLE},
      receive: {msg: $log.JSONABLE},
    },
    calls: {
      appConnectHandler: {},
      handleMsg: {type: true},
      appCloseHandler: {},
    },
    TEST_ONLY_calls: {
      handleMsg: {msg: $log.JSONABLE},
    },
    errors: {
      connectError: {error: false},
      connectFailed: {error: false},

      corruptServerEphemeralKey: {},

      badProto: {},
      corruptBox: {},

      badMessage: {inState: true, type: true},
      queueBacklogExceeded: {},
      websocketError: {err: false},
      handlerFailure: {err: $log.EXCEPTION},
    },
    LAYER_MAPPING: {
      layer: "protocol",
      transitions: [
        {after: {connState: "app"}, become: "app"},
      ],
    },
  },
  serverConn: {
    type: $log.CONNECTION,
    subtype: $log.SERVER,
    semanticIdent: {
      serverIdent: 'server',
      _l1: null,
      endpoint: 'type',
      _l2: null,
      clientIdent: 'client',
      _l3: null,
      port: 'unique',
    },
    stateVars: {
      connState: true,
      appState: true,
    },
    events: {
      connected: {},
      send: {type: true},
      receive: {type: true},
      closing: {isBad: true},
      closed: {},
    },
    TEST_ONLY_events: {
      send: {msg: $log.JSONABLE},
      receive: {msg: $log.JSONABLE},
    },
    calls: {
      handleMsg: {type: true},
      appCloseHandler: {},
    },
    TEST_ONLY_calls: {
      handleMsg: {msg: $log.JSONABLE},
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

      badMessage: {inState: true, type: true},
      queueBacklogExceeded: {},
      websocketError: {err: false},
      handlerFailure: {err: $log.EXCEPTION},
    },
    LAYER_MAPPING: {
      layer: "protocol",
      transitions: [
        {after: {connState: "app"}, become: "app"},
      ],
    },
  },
  server: {
    type: $log.SERVER,
    topBilling: true,
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
