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
 * Wrap the MozWebSocket implementation by stealing it from a hidden iframe and
 *  exposing it to look like the node.js websocket implementation we are using.
 *  Our adaption is intended to be limited to pretending to be two-stage like
 *  WebSocketClient is and to convert the node EventEmitter idiom to the DOMy
 *  attribute idiom.
 **/

let $hframe = require('hidden-frame');

var afterLoaded = [];

exports.GECKO = true;
exports.helpers = {};

let MozWebSocket = null;
let gHiddenFrame = $hframe.add($hframe.HiddenFrame({
  onReady: function() {
    MozWebSocket = this.element.contentWindow.MozWebSocket;
    exports.helpers.btoa = this.element.contentWindow.btoa;
    exports.helpers.atob = this.element.contentWindow.atob;

    for (var i = 0; i < afterLoaded.length; i++) {
      afterLoaded[i]();
    }
    afterLoaded = null;
  }
}));

exports.afterLoaded = function(callback) {
  if (MozWebSocket) {
    callback();
  }
  else {
    afterLoaded.push(callback);
  }
};

function WebSocketClient(opts) {
  this.ws = null;
  this.handlers = {};
}
exports.WebSocketClient = WebSocketClient;
WebSocketClient.prototype = {
  connect: function(url, protocols) {
    let ws = new MozWebSocket(url, protocols);
    let shim = this.shim = new WebSocketConnShim(ws);

    if (this.handlers.hasOwnProperty("error"))
      ws.onerror = this.handlers.error;

    var self = this;
    ws.onopen = function() {
      if (self.handlers.hasOwnProperty("connect"))
        self.handlers.connect(shim);
    };
  },

  on: function(what, handler) {
    this.handlers[what] = handler;
  },
};

function WebSocketConnShim(ws) {
  this.ws = ws;
}
WebSocketConnShim.prototype = {
  on: function(what, handler) {
    if (what === 'message') {
      this.ws.onmessage = function(e) {
        var fake = {
          type: 'utf8',
          utf8Data: e.data,
        };
        return handler(fake);
      };
    }
    else {
      this.ws['on' + what] = handler;
    }
  },

  sendUTF: function(msg) {
    this.ws.send(msg);
  },

  sendBytes: function(bytes) {
    throw new Error("gecko dunnae support binary frames!");
  },

  close: function() {
    this.ws.close();
  },

  socket: {
    address: function() {
      return {port: -1};
    },
    remotePort: -1,
  },
};
