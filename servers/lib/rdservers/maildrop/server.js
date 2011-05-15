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
 * Maildrop message reception logic; receive one or more `MaildropTransitEnvelope`
 **/

define(
  [
    'exports'
  ],
  function(
    exports
  ) {

/**
 * Delivery processing connection.
 */
function DeliveryConnection(server, sock) {
  this.server = server;
  this._sock = sock;
  this.logger = server.logger.newChild('connection', sock.remoteAddress);

}
DeliveryConnection.prototype = {
  _initialState: 'wantTransitEnvelope',

  _msg_root_deliver: function(msg) {
    // - retrieve the sender's credentials from the recipient's contacts
    // (if they aren't there, they aren't an authorized sender.)

    // verify the signature on the transit envelope

    // hand off to the back-end for saving and/or forwarding:
    // - in a standalone drop, we persist and notify any connected listeners
    // - in a combo, we hand off to the mailstore

    // ack once the back-end confirms it has hit persistent storage
  },
};

/**
 * Connection to let a mailstore/user tell us who they are willing to receive
 *  messsages from.
 */
function ContactConnection(server, sock) {
};
ContactConnection.prototype = {
  _msg_root_addContact: function(msg) {

  },

  _msg_root_delContact: function(msg) {
  },
};

/**
 * Message retrieval (fetch) from a maildrop by a mailstore.
 *
 * Pickup connections have simple semantics.  Once you connect and authenticate,
 *  we start sending messages.  You need to acknowledge each message so we can
 *  purge it from our storage.  Once we run out of queued messages, we send a
 *  'realtime' notification to let you know that there are no more queued
 *  messages and that you are now subscribed for realtime notification of new
 *  messages.  You need to acknowledge realtime messages just like queued
 *  messages.  If you don't want realtime messages, disconnect.
 */
function PickupConnection(server, sock) {
};
PickupConnection.prototype = {
  _msg_wantAck_ack: function(msg) {
  },
};

var DropServerDef = {
  endpoints: {
    'drop/deliver': {
      implClass: DeliveryConnection,
    },

    'drop/contacts': {
      implClass: ContactConnection,
    },

    'drop/fetch': {
      implClass: PickupConnection,
    },
  },
};

var LOGFAB = exports.LOGFAB = $log.register($module, {
  delivery: {
    implClass: DeliveryConnection,
  },
  contact: {
    implClass: ContactConnection,
  },
  pickup: {
    implClass: PickupConnection,
  },
});

}); // end define
