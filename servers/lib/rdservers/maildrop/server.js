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
 * Maildrop message reception logic; receive a `MaildropTransitEnvelope`
 **/

define(
  [
    'net',
    'exports'
  ],
  function(
    $net,
    exports
  ) {

/**
 * Stateful connection handler that authenticates and establishes an encrypted
 * connection with a sender, then receives one or more messages and processes
 * them.
 *
 * Encryption is used during communication primarily to constrain traffic
 * analysis to pairs of servers rather than pairs of identities (which are
 * explicitly named in cleartext by the `MaildropTransitEnvelope`).  For
 * efficiency and additional traffic analysis
 *
 * General sequence goes like so:
 * @itemized[
 *   @item{
 *     Mailsender establishes a TCP connection to the maildrop.
 *   }
 *   @item{
 *     Mailsender opens with a packet identifying itself (key hash), who it
 *     thinks it is talking to (key hash),
 *   }
 * ]
 */
function DropConnection(server, sock) {
  this.server = server;
  this._sock = sock;
  this.logger = server.logger.newChild('connection', sock.remoteAddress);

  sock.on('data', this._onData.bind(this));
  sock.on('end', this._onEnd.bind(this));
  sock.on('close', this._onClose.bind(this));
  sock.on('error', this._onError.bind(this));
}
DropConnection.prototype = {
  _onData: function(data) {
  },
  
  _onEnd: function() {
  },
  _onClose: function() {
    this.logger.close();
  },

  _onError: function() {
  },
};

/**
 *
 */
function DropServer() {
  var server = this._netServer = new $net.createServer();
  server.on('connection', this._onConnection.bind(this));
}
DropServer.prototype = {
  _onConnection: function(socket) {
  },
};

}); // end define
