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
 *
 **/

define(
  [
    'q',
    'rdcommon/log',
    'rdcommon/transport/authconn',
    'exports'
  ],
  function(
    $Q,
    $log,
    $authconn,
    exports
  ) {

/**
 * One-off message delivery connection instantiated on-the-fly via the
 *  mailsender API.  This is a stop-gap measure; we want a reliable queue
 *  that is capable of batching, etc.
 */
function SendDeliveryConnection(type, transitMsg,
                                clientKeyring, serverPublicKey,
                                serverUrl, _logger) {
  this._type = type;
  this._msg = transitMsg;

  this.conn = new $authconn.AuthClientConn(
                this, clientKeyring, serverPublicKey,
                serverUrl, 'drop/deliver', _logger);
  this._deferred = $Q.defer();
  this.promise = this._deferred.promise;
}
exports.SendDeliveryConnection = SendDeliveryConnection;
SendDeliveryConnection.prototype = {
  INITIAL_STATE: 'deliver',

  __connected: function() {
    this.conn.writeMessage({
      type: this._type,
      msg: this._msg,
    });
  },

  __closed: function() {
    this._deferred.reject("connection closed without delivery ack");
  },

  _msg_deliver_ack: function(msg) {
    this._deferred.resolve();
    return this.conn.close();
  },

  _msg_deliver_bad: function(msg) {
    // if we were not a one-shot connection, we would note the bad message
    //  for bad actor handling, but otherwise continue on with our job.
    this._deferred.reject("other side says our message is bad");
    return this.conn.close();
  },
};

}); // end define
