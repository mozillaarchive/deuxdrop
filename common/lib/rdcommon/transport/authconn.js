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
    'nacl',
    'websocket',
    'exports'
  ],
  function(
    $nacl,
    $wsc,
    exports
  ) {

var DEFAULT_ORIGIN_OPTS = {origin: 'http://none.such'};

function AuthClientConn(clientInfo, serverInfo, url) {
  this._ws = new $wsc.WebSocket(url, null, DEFAULT_ORIGIN_OPTS);

}
AuthClientConn.prototype = {
};
exports.AuthClientConn = AuthClientConn;

function AuthServerConn() {
}
AuthServerConn.prototype = {
};

}); // end define
