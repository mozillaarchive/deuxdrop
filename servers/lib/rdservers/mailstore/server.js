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
 * Message store reception logic.
 **/

define(
  [
    'q',
    'exports'
  ],
  function(
    $Q,
    exports
  ) {
var when = $Q.when;

/**
 * Receives requests from the client and services them in a synchronous fashion.
 *  The client is allowed to send subsequent requests before we acknowledge
 *  the completion of a given request (up to the limit allowed by authconn)
 *  in order to effect pipelining.
 *
 * Our security model (for the connection) is that:
 * - We don't worry about a bad actor pretending to be the client, we just worry
 *  about the client being a bad actor.  Our transport layer precludes replay
 *  attacks which means that the client or something with its key is on the
 *  other end of the connection.
 * - All detection of bad actors is handled elsewhere; quota logic, rate
 *  limiting/information extraction limiting, etc. is not done by us.
 *
 * In the opposite direction, the client does not want to have to trust us a
 *  lot.  So if there's something it tells us that we might need to tell it
 *  again later, it will tend to want to wrap them in signed attestations.  That
 *  way the device has something stronger than "I swear, you told me this
 *  earlier" to go on.  Likewise, if an attacker inserts stuff into our
 *  database, we can weed out attacker injected stuff because we won't be
 *  able to revalidate it.
 *
 * We talk to the maildrop, mailsender, and fanout server roles via proxy
 *  objects that may either directly effect the requested changes (locally
 *  hosted) or do an reliable RPC-type thing (remote hosted).
 */
function ClientServicingConnection(conn) {
  this.conn = conn;
  this.config = conn.serverConfig;
}
ClientServicingConnection.prototype = {
  INITIAL_STATE: 'init',

  /**
   * The device tells us its current sequence id and its replication level so we
   *  know when its last update was and whether we need to force a re-sync.
   */
  _msg_init_deviceCheckin: function(msg) {
    // XXX connect to persistent subscriptions feed.
  },


  /**
   * Receive an ack about notifications from persistent subscriptions.
   *
   * XXX ideally this would be orthogonal/out-of-band versus our other
   *  message flows in here.  We need to make sure to bound the number of
   *  unacked updates we can have outstanding to not cause queue overflow
   *  in the authconn, especially if the client is pipelining its actions.
   */
  _msg_root_ackFeed: function(msg) {
    return 'root';
  },

  /**
   * Request a conversation index, such as:
   * - All conversations (by time).
   * - Conversations with a specific content (by time).
   *
   * This will retrieve some bounded number of conversations, where, for each
   *  conversation, we always provide:
   * - The conversation id
   * - Any user-set meta-data on the conversation or its messages.
   * - The sanity-clamped timestamps of the messages in the conversation.
   */
  _msg_root_convGetIndex: function(msg) {
  },

  /**
   * Fetch messages in a conversation.
   */
  _msg_root_convGetMsgs: function(msg) {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Conversation Mutation

  /**
   */
  _msg_root_createConversation: function(msg) {
  },

  /**
   * Set meta-data on a conversation/messages.
   */
  _msg_root_setMeta: function(msg) {
  },

  /**
   * Delete messages in a conversation, possibly all of them.
   */
  _msg_root_delConvMsgs: function(msg) {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Contact Mutation

  /**
   * Add a new contact, someday with related-metadata for prioritization, etc.
   *
   * This affects the following roles idempotently like so:
   * - mailstore: Adds the contact to our address book.
   * - maildrop: Adds an authorization for the user to contact us.
   *
   * @args[
   *   @param[msg @dict[
   *     @key[otherPersonIdent OtherPersonIdentBlob]
   *   ]]
   * ]
   */
  _msg_root_addContact: function(msg) {
    // - verify the attestation

    // - persist the attestation to our random-access store

    // - enqueue for other (existing) clients

    // - perform maildrop/fanout authorization
    this.config.dropApi.authorizeServerUserForContact();
  },

  /**
   * Modify the metadata associated with a contact.
   */
  /*
  _msg_root_modContact: function(msg) {
  },
  */

  /**
   * Delete a contact.
   */
  /*
  _msg_root_delContact: function(msg) {
  },
  */

  //////////////////////////////////////////////////////////////////////////////
};
exports.ClientServicingConnection = ClientServicingConnection;

exports.makeServerDef = function(serverConfig) {
  return {
    endpoints: {
      'mailstore/mailstore': {
        implClass: ClientServicingConnection,
        serverConfig: serverConfig,
        /**
         * Verify that the client in question is allowed to talk to us.
         */
        authVerifier: function(endpoint, clientKey) {
          return serverConfig.authApi.serverFetchUserEffigyUsingClient(
            clientKey, "store");
        },
      },
    },
  };
};


}); // end define
