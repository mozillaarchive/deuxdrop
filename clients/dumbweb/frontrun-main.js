/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Defers kicking off the actual UI until after we have logged-in with
 *  BrowserID/PersonaID.  Once we have the assertion in our hands, we send it
 *  down the WebSocket tunnel, hook up the moda bridge, and let the UI do its
 *  thing.
 **/

define(function (require, exports, modules) {

var $persona = require('browserId'),
    Moda = require('modality');

function fatalDeath(msg) {
  window.alert(msg);
}

if (!WebSocket)
  WebSocket = MozWebSocket;
if (!WebSocket) {
  fatalDeath("You don't seem to have websocket support and are SOL.");
  return;
}

var sock = null, sessionCookie = null;

function initiateSignin(sendFunc) {
  navigator.id.getVerifiedEmail(function(assertion) {
    console.log("got assertion!");
    sendFunc({
      type: "assertion",
      assertion: assertion,
    });
  });
}

// perform some backoff on reconnection, but not too much.
const RECONNECT_BASE_DELAY = 1000,
      RECONNECT_MAX_DELAY = 10000;
var RECONNECT_DELAY = RECONNECT_BASE_DELAY;

function establishChannel(restorePayload) {
  var location = window.location,
      wsUrl = ((location.protocol === 'http:') ? 'ws:' : 'wss:') +
              '//' + location.host + '/' +
              // and if we are mapped to a subdirectory via a proxy, we
              //  want that bit of the path.
              location.pathname.substring(0,
                location.pathname.indexOf('/dumbweb/mobileui/index.html'));

  var outSeqNo = 0, lastInSeqNo = 0, connecting = true,
      sessionCookie = null;
  sock = new WebSocket(wsUrl, "dumbweb.bridge");
  sock.onerror = function(event) {
    if (connecting) {
      RECONNECT_DELAY = Math.min(RECONNECT_MAX_DELAY,
                                 RECONNECT_DELAY * 2);
      console.log("error while connecting, increased delay to:",
                  RECONNECT_DELAY);
      return;
    }

    console.warn("socket error:", event);
  };
  sock.onmessage = function(event) {
    var msg = JSON.parse(event.data);
    console.log("msg", msg.type, msg);

    // - authentication success, session restore success
    if (msg.type === 'success' ||
        msg.type === 'restored') {
      if (msg.type === 'restored') {
        restorePayload = null;
        // we could have sent some queries in the interim...
        outSeqNo += msg.clientSeq;
        lastInSeqNo = msg.serverSeq;
      }

      sessionCookie = msg.sessionCookie;

      Moda._receive({
        type: 'connectionStatus',
        status: 'connected'
      });

      // promote to moda bridge, let the UI start up.
      Moda._sendObjFunc = function(obj) {
        outSeqNo++;
        sock.send(JSON.stringify(obj));
      };
      sock.onmessage = function(event) {
        lastInSeqNo++;
        var msg = JSON.parse(event.data);
        //console.log("MSG", msg);
        // Eat connectionStatus updates from the server because they are
        //  meaningless; they reflect the state of the server connecting to
        //  itself.
        if (msg.type === 'connectionStatus')
          return;
        Moda._receive(msg);
      };

      triggerRealUI();
    }
    // - authentication failure
    else if (msg.type === 'badverify') {
      fatalDeath("Your PersonaID was no good!  Maybe refresh?");
      sock.close();
    }
    // - session restore failure
    else if (msg.type === 'badrestore') {
      restorePayload = null;
      // we tried to restore, but it didn't work.
      // XXX it's feasible to make moda clever enough to re-establish its
      //  queries and locally nuke and re-establish as required, but for now
      //  let's just force a page refresh.
      sock.close();
      window.location.reload(false);
    }
  };

  var toSend = null;
  sock.onopen = function() {
    console.log("connection opened");
    connecting = false;
    RECONNECT_DELAY = RECONNECT_BASE_DELAY;
    if (restorePayload) {
      console.log(" sending restore payload:", restorePayload);
      sock.send(JSON.stringify(restorePayload));
    }
    if (toSend) {
      console.log("sending queued", toSend);
      sock.send(JSON.stringify(toSend));
      toSend = null;
    }
  };
  sock.onclose = function() {
    Moda._receive({
      type: 'connectionStatus',
      status: 'disconnected'
    });
    setTimeout(function() {
      var payload = null;
      if (sessionCookie) {
        payload = {
          sessionCookie: sessionCookie,
          serverSeq: lastInSeqNo,
          clientSeq: outSeqNo,
        };
      }
      establishChannel(payload);
    }, RECONNECT_DELAY);
  };

  return function sender(data) {
    if (sock.readyState === 1) {
      console.log("sending immediately", data);
      sock.send(JSON.stringify(data));
    }
    else {
      if (toSend) {
        console.warn("Overflowing limited send buffer capabilities");
      }
      toSend = data;
    }
  };
}

function triggerRealUI() {
  console.log("triggering real UI");
  var realUI = require('../mobileui/js/real-main.js');
  realUI.main();
}

exports.main = function fronRunMain() {
  initiateSignin(establishChannel(null));
};

});
