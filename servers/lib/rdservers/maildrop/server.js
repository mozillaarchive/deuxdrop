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
    'rdcommon/log',
    'rdcommon/taskidiom', 'rdcommon/taskerrors',
    'module',
    'exports'
  ],
  function(
    $auth_api,
    $log,
    $task, $taskerrors,
    $module,
    exports
  ) {

var AuthAPI = $auth_api;


var LOGFAB = exports.LOGFAB = $log.register($module, {
  deliveryConn: {
  },
});


var taskMaster = $task.makeTaskMasterForModule($module, LOGFAB);

/**
 * The delivery conn receives inbound messages targeted at either users (in
 *  the guise of their mailstore) or daemons.  We operate within an authconn
 *  connection which means that we know we are talking to the server we think
 *  we are talking to, not that the server speaks with the same authority as
 *  one of its users.  For this reason, everything we receive needs to come in
 *  a transit envelope to us from the user causing things to happen.
 *
 * Conversations are a special case because they rely on a fanout daemon which
 *  exists so that the humans in the system don't have to know all of the
 *  (eventual) recipients.  In this case we are relying on the fanout server
 *  to be sure to verify the users sending it messages.  In the event it goes
 *  rogue, the price of conversation convenience means that it can cram
 *  (user-)detectable/discardable garbage into specific conversations.
 */
function ReceiveDeliveryConnection(conn) {
  this.conn = conn;
}
ReceiveDeliveryConnection.prototype = {
  INITIAL_STATE: 'root',

  /**
   * Receive/process a transit message from a user directed to us for
   *  delivery to our user or our conversation daemon.
   */
  _msg_root_deliverTransit: function(msg) {
    var transitMsg = msg.msg;

    var outerEnvelope = msg.outerEnvelope, innerEnvelope;

    // -- try and open the inner envelope.
    // (catch exceptions from the decryption; bad messages can happen)
    try {
      innerEnvelope = JSON.parse(
                        config.keyring.openBoxUtf8(outerEnvelope.innerEnvelope,
                                                   outerEnvelope.nonce,
                                                   outerEnvelope.senderKey));
    }
    catch(ex) {
      // XXX log that a bad message happened
      // XXX note bad actor evidence
      // tell the other server it fed us something gibberishy
      this.sendMessage
    }



    return new DeliverTransitTask({
                                    outerEnvelope: msg,
                                    config: this.conn.serverConfig,
                                    otherServerKey: this.conn.clientPublicKey,
                                  },
                                  this.conn.log);
  },

  /**
   * Receive/process a message from a fanout server to one of our users
   *  regarding a conversation our user should be subscribed to.
   */
  _msg_root_deliverServer: function(msg) {
  },
};

var DeliverTransitTask = taskMaster.defineTask({
  name: "deliverTransit",
  steps: {
    /**
     * The outer envelope names a sending key, open it.  We need to see what's
     *  written on the inner envelope before we can actually do something
     *  useful.
     */
    open_outer_envelope: function(arg) {
      this.config = arg.config;
      var outerEnvelope = arg.outerEnvelope;
    },
    /**
     * Make sure the user is authorized to do whatever they're trying to get
     *  up to.
     */
    check_authorization: function(innerEnvelope) {
      if (innerEnvelope.type === "user" ||
          innerEnvelope.type === "joinconv") {
        return this.config.authApi.userCheckServerUser(
          innerEnvelope.name, this.arg.otherServerKey,
          this.arg.outerEnvelope.senderKey);
      }
      else if (innerEnvelope.type === "convadd" ||
               innerEnvelope.type === "convmsg") {
        return this.config.authApi.convCheckServerUser(
          innerEnvelope.convId, this.arg.otherServerKey,
          this.arg.outerEnvelope.senderKey);
      }
      else {
        throw new $taskerrors.MalformedPayloadError(
          "Bad inner envelope type '" + innerEnvelope.type + "'");
      }
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
        return $auth_api.serverCheckServerAuth(clientKey);
      }
    },
  },
};

}); // end define
