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
 * Local API for mail sending; if you are trying to route to our own server, we
 *  automatically bypass (in a blocking asynchronous fashion) to ourselves.
 **/

define(
  [
    'q',
    'rdcommon/log',
    'rdcommon/identities/pubident',
    'rdservers/maildrop/server',
    './server',
    'module',
    'exports'
  ],
  function(
    $Q,
    $log,
    $pubident,
    $maildrop_server,
    $mailsender_server,
    $module,
    exports
  ) {
var when = $Q.when;

exports.dbSchemaDef = {
  tables: [
    {
      name: TBL_SERVER_URL,
      columnFamilies: ['u'],
      indices: [],
    },
  ],
  queues: [],
};

const TBL_SERVER_URL = "sender:serverUrl";

function MailsenderLocalApi(serverConfig, dbConn, _logger) {
  this._config = serverConfig;
  this._db = dbConn;
  
  this._log = LOGFAB.senderLocalAPI(this, _logger);
}
exports.Api = MailsenderLocalApi;
MailsenderLocalApi.prototype = {
  /**
   * Set the contact URL for a server given its self-ident.  This is an attack
   *  surface with the following sinister potentials we want to avoid (where
   *  most are easily avoidable):
   *
   * - Allowing our server connections to be needlessly routed through an
   *    attacker, allowing them to trivially perform traffic analysis and denial
   *    of service.  Although we have end-to-end encryption, our transport layer
   *    does not verify the address we are talking to the server with, making
   *    this feasible if other means are not used.  This is mitigated by only
   *    accepting server URLs from self-idents issued by the server.
   *
   * - Leaking information about the sender based or recipient on the URL we use
   *    to contact it, potentially making denial-of-service attacks on specific
   *    user traffic feasible.  For example, a server could generate a new URL
   *    for each user it signs up and a matching self-ident.  A user could
   *    cooperate and go further and issue a different self-ident to give to
   *    each new potential contact.  This is not a particularly likely situation
   *    because a server could easily disclose the same information without
   *    making it visible to external observers, but it could happen.  Note that
   *    a server could go further and create a separate server identity for
   *    every user account it has, but that would be even more blatantly obvious
   *    and is not something we can do much about.
   *
   * Accordingly, we always take the server URL from self-idents, and we only
   *  use a user-supplied self-ident for the first time we hear about a server.
   *  We only accept updates to the contact URL directly from the server,
   *  avoiding possible information leaks about users.  We currently do not
   *  generate an error or exception if the user is providing us a self-ident
   *  that names a different URL from the current URL, although it is
   *  slightly concerning.
   *
   * This does leave the following risks:
   * - Information leak about the first server that signs up.
   * - The different-server-ident per user case may not be well expressed via
   *    the UI.  For example, if we just say "the server at example.com" even
   *    though there are 1,001 servers hosted on "example.com", that would be
   *    bad.  Hopefully we don't do that given our emphasis on local names.
   */
  setServerUrlUsingSelfIdent: function(serverSelfIdent) {
    var boxingPublicKey = $pubident.peekServerSelfIdentBoxingKeyNOVERIFY(
                            serverSelfIdent);
    var self = this;
    return when(this._db.getRow(TBL_SERVER_URL, boxingPublicKey),
      function(cells) {
        // - not coherently present, store it.
        if (!cells["u:url"] || !cells["u:ident"]) {
          var identPayload = $pubident.assertGetServerSelfIdent(serverSelfIdent);
          var writeCells = {
            "u:url": identPayload.url,
            "u:ident": serverSelfIdent
          };
          return self._db.putCells(TBL_SERVER_URL, boxingPublicKey, writeCells);
        }
        // - mismatch, be concerned.
        // (this covers a url mismatch too)
        else if (cells["u:ident"] != serverSelfIdent) {
          this._log.selfIdentMismatch(cells["u:ident"], serverSelfIdent);
        }
        // (if we are here, there is already a url at least, so we're good)
        return true;
      }
      // rejection pass-through is fine
    );
  },

  /**
   * Retrieve a server's current known URL using its pub box key.  The choice
   *  over root key is because that's not really used in practice and we have
   *  no actual plans for how the long-term box keys get changed.
   */
  getServerUrl: function(serverPubBoxKey) {
    var self = this;
    return when(this._db.getRowCell(TBL_SERVER_URL, serverPubBoxKey, "u:url"),
      function(url) {
        self._log.gotUrl(url);
        // this becomes a rejection
        if (!url)
          throw new Error("Database does not know about the server!");
        return url;
      }
      // pass-through rejection is fine.
    );
  },

  /**
   * @args[
   *   @param[outerEnvelope PSTransitOuterEnvelope]
   * ]
   */
  sendPersonEnvelopeToServer: function(userRootKey, outerEnvelope,
                                       serverPublicBoxKey) {
    if (!serverPublicBoxKey)
      throw new Error("we need an actual key");
    if (serverPublicBoxKey === this._config.keyring.boxingPublicKey) {
      this._log.selfSendPersonEnvelope();
      return $maildrop_server.fauxPersonEnqueueProcessNow(
               this._config, outerEnvelope,
               this._config.keyring.boxingPublicKey, this._log);
    }

    var self = this;
    return when(this.getServerUrl(serverPublicBoxKey), function(url) {
       self._log.sendPersonEnvelope(serverPublicBoxKey);
       var deliveryConn = new $mailsender_server.SendDeliveryConnection(
                                'deliverTransit',
                                outerEnvelope, self._config.keyring,
                                serverPublicBoxKey, url, self._log);
       return when(deliveryConn.promise,
         null, // pass-through fulfillment is fine
         function errback() {
           // - report the delivery error
           // XXX would be nice to have this more directly correlate with the
           //  user, but maybe that is just something that the log server should
           //  reconstruct?
           self._log.deliveryFailure(userRootKey);
         }
       );
      }
      // pass-through rejection is fine.
    );
  },

  /**
   * @args[
   *   @param[envelope SSTransitEnvelope]
   *   @param[serverPublicBoxKey]
   * ]
   */
  sendServerEnvelopeToServer: function(envelope, serverPublicBoxKey) {
    if (!serverPublicBoxKey)
      throw new Error("we need an actual key");
    if (serverPublicBoxKey === this._config.keyring.boxingPublicKey) {
      this._log.selfSendServerEnvelope();
      return $maildrop_server.fauxServerEnqueueProcessNow(
               this._config, envelope,
               this._config.keyring.boxingPublicKey, this._log);
    }

    var self = this;
    return when(this.getServerUrl(serverPublicBoxKey), function(url) {
       self._log.sendServerEnvelope(serverPublicBoxKey);
       var deliveryConn = new $mailsender_server.SendDeliveryConnection(
                                'deliverServer',
                                envelope, self._config.keyring,
                                serverPublicBoxKey, url, self._log);
       return when(deliveryConn.promise,
         null, // pass-through fulfillment is fine
         function errback() {
           self._log.serverDeliveryFailure(serverPublicBoxKey);
         }
       );
      }
      // pass-through rejection is fine.
    );
  },

  /**
   * Send a contact request.
   * XXX right now we always use a one-off connection
   */
  sendContactEstablishmentMessage: function(envelope, serverPublicBoxKey) {
    if (!serverPublicBoxKey)
      throw new Error("we need an actual key");
    if (serverPublicBoxKey === this._config.keyring.boxingPublicKey) {
      this._log.selfSendEstablish();
      return $maildrop_server.fauxEstablishProcessNow(
               this._config, envelope,
               this._config.keyring.boxingPublicKey, this._log);
    }

    var self = this;
    return when(this.getServerUrl(serverPublicBoxKey), function(url) {
       self._log.sendEstablish(serverPublicBoxKey);
       var deliveryConn = new $mailsender_server.SendEstablishConnection(
                                envelope, self._config.keyring,
                                serverPublicBoxKey, url, self._log);
       return when(deliveryConn.promise,
         null, // pass-through fulfillment is fine
         function errback() {
           self._log.establishDeliveryFailure(serverPublicBoxKey);
         }
       );
      }
      // pass-through rejection is fine.
    );
  },
};

var LOGFAB = exports.LOGFAB = $log.register($module, {
  senderLocalAPI: {
    //implClass: AuthClientConn,
    type: $log.DAEMON,
    subtype: $log.DAEMON,
    events: {
      gotUrl: {url: false},
      selfSendPersonEnvelope: {},
      selfSendServerEnvelope: {},
      selfSendEstablish: {},

      sendPersonEnvelope: {serverKey: false},
      sendServerEnvelope: {serverKey: false},
      sendEstablish: {serverKey: false},
    },
    errors: {
      selfIdentMismatch: {dbCopy: false, userCopy: false},
      deliveryFailure: {userRootKey: 'key'},
      serverDeliveryFailure: {recipientServer: 'key'},
      establishDeliveryFailure: {recipientServer: 'key'},
    },
    LAYER_MAPPING: {
      layer: "api",
    },
  },
});

}); // end define
