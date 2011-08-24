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
 * Test the interoperation of our authconn implementation with the node.js one
 *  by having an already-running echo server receive our connections and both
 *  repeat things we tell it verbatim as well as to perform minor manipulations.
 **/

let $authconn = require('rdcommon/transport/authconn'),
    $keyring = require('rdcommon/crypto/keyring'),
    $websocket = require('websocket'),
    $timers = require('timers');

var serverPersisted =
{
  "v": 1,
  "auth": "longterm",
  "type": "box",
  "rootPublicKey": "¹Fu\u0002\u0007(-·b!5yØ\"¢H¿Wb»\u001d:QÜ\u0015ìîÛ­",
  "longtermBoxBundle": {
    "keypair": {
      "tag": "longterm:box",
      "secretKey": "\u0000\u000b\u0012\u00027\u0019cÝi\u000eæ67a\flË­þ1~^:£X6éð\u000b¬\u0007g",
      "publicKey": "Êø\u001b¤*\tú0òÍôN×\u0013\u0013]Ç@ÖªÐ5­çÛët"
    },
    "authorization": "Üù\u0014t\u0007¦`w¼i¸áa=Í¨³S`©¤$Òã9nØ{\"issuedAt\":1314133783364,\"authStarts\":1314133783364,\"authEnds\":1377205783364,\"authorizedFor\":\"longterm:box\",\"authorizedKey\":\"Êø\\u001b¤*\\tú0òÍôN×\\u0013\\u0013]Ç@ÖªÐ5­çÛët\",\"canDelegate\":false}ÕZ$h0Éî\u0001\u0005¿Q&JÉ\u001fl\u0011\rv©|v\r"
  }
};

var clientPersisted =
{
  "v": 1,
  "auth": "delegated",
  "rootPublicKey": "åñZ<7Í@Iº\u0002½\r,ÃQÁ_\"!ØÎWa\u0002\u001ei\u0013<1",
  "longtermSignPublicKey": "\u000fe<ÞÚÑîAvñM\u0012LïjtEÃ!ÈÐ\u000b\u0011",
  "activeGroups": {
    "client": {
      "groupName": "client",
      "keypairs": {
        "connBox": {
          "tag": "general:box",
          "secretKey": "\"µc\u0004¥)OÒUY/®¦iEeª³bk\u001b1í=÷sa)",
          "publicKey": "(g3R'¨üe\u0002Õ.uÌËóÅ#ÛFpÓsÖt'W"
        }
      },
      "authorization": "Ü@éþÒìÍÑ2À0§N5Ò¹\"s(\t\"Â\u001d\tø¹ö©{\"issuedAt\":1314133783382,\"groupName\":\"client\",\"publicKeys\":{\"connBox\":\"(g3R'¨üe\\u0002Õ.uÌËóÅ#ÛFpÓsÖt'W\"}}\u0000ô0<f\u0015ö`ÚôµÊ1¥ëi'?a\u0016QßL¬>Èz\r",
      "publicAuth": null
    }
  },
  "activeSecretBoxKeys": {},
  "activeAuthKeys": {}
};

var gConn = null;

function TestClientConnection(tester, clientKeyring, serverPublicKey) {
  gConn = this;
  this.tester = tester;

  this.conn = new $authconn.AuthClientConn(this, clientKeyring, serverPublicKey,
                                           'ws://localhost:9232/', 'echo');
}
TestClientConnection.prototype = {
  INITIAL_STATE: 'root',
  __connected: function() {
    this.conn.writeMessage({
      type: 'echo',
      what: 'hats-are-fun',
    });
  },

  _msg_root_echo: function(msg) {
    this.tester.assertEqual(msg.what, 'hats-are-fun');

    this.conn.writeMessage({
      type: 'twiddle',
      value: 1
    });
    return 'echoed';
  },

  _msg_echoed_twiddled: function(msg) {
    this.tester.assertEqual(msg.value, 2);

    this.tester.done();
    return this.conn.close();
  },
};

exports.testEchoServer = function(test) {
  // hack up the logger infrastructure to think it wants a full on logger.
  $authconn.LOGFAB._generalLog = true;

  var personKeyring = $keyring.loadDelegatedKeyring(clientPersisted),
      clientKeyring = personKeyring.exposeSimpleBoxingKeyringFor("client",
                                                                 "connBox"),
      serverKeyring = $keyring.loadLongtermBoxingKeyring(serverPersisted);

  $timers.setTimeout(function() {
    console.log(JSON.stringify(gConn.conn.log._entries, null, 2));
  }, 3 * 1000);
  test.waitUntilDone(4 * 1000);
  $websocket.afterLoaded(function() {
    var testConn = new TestClientConnection(test, clientKeyring,
                                            serverKeyring.boxingPublicKey);
  });
};
