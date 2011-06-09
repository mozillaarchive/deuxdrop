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
    '../authdb/api',
    'exports'
  ],
  function(
    $auth_api,
    exports
  ) {

var AuthAPI = $auth_api;

/**
 * Delivery processing connection.
 */
function ReceiveDeliveryConnection(conn) {
  this.conn = conn;
}
ReceiveDeliveryConnection.prototype = {
  INITIAL_STATE: 'root',

  _msg_root_deliver: function(msg) {
    return new DeliverTask(msg, this.conn.log);
  },
};

var DeliverTask = taskMaster.defineTask({
  name: "deliver",
  steps: {
    retrieve_sender_credentials: function() {
      // -- retrieve the sender's credentials from the recipient's contacts
      // (if they aren't there, they aren't an authorized sender.)
      return checkUserPrivilege
    },
    verify_transit_envelope_signature: function() {
    },
    back_end_hand_off: function() {
      // -- hand off to the back-end for saving and/or forwarding:
      // (in a standalone drop, we persist and notify any connected listeners)
      // (in a combo, we hand off to the mailstore)

    },
    ack_now_that_the_message_is_persisted: function() {
    }
  },
});

/**
 * Connection to let a mailstore/user tell us who they are willing to receive
 *  messsages from.
 *
 * XXX notyet, mailstore can handle direct
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
 *
 * XXX notyet, mailstore can handle direct
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
      implClass: ReceiveDeliveryConnection,
      authVerifier: function(endpoint, clientKey) {
        // we are just checking that they are allowed to talk to us at all
        return $auth_api.checkServerAuth(clientKey);
      }
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
    implClass: ReceiveDeliveryConnection,
  },
  contact: {
    implClass: ContactConnection,
  },
  pickup: {
    implClass: PickupConnection,
  },
});

}); // end define
