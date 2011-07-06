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
    'rdcommon/log',
    'rdcommon/identities/pubident',
    './ustore', // note: cannot include uproc; it uses us for gConnTracker...
    'exports'
  ],
  function(
    $Q,
    $log,
    $pubident,
    $ustore,
    exports
  ) {
var when = $Q.when;


/**
 * Really simple class to track connections.  We do this for:
 *
 * - To let multiple client connections for a single user be aware of each other
 *    for minizming replica latency.  This might eventually be mooted by just
 *    having a message queue abstraction that will perform async notifications
 *    on its own.
 * - To detect multiple concurrent connections from a client and kill the old
 *    ones automatically.  We expect this to happen in cases where a device
 *    changes IPs or something similar that causes our TCP connection with them
 *    to go into a mode that will take a long time to die on its own.  This
 *    may also occur in malicious situations with attackers.  Malicious
 *    situations would ideally be revealed by the new device indicating a
 *    device state inconsistent with the device we just bumped.
 */
function UserConnectionsTracker() {
  this.liveByRootKey = {};
}
UserConnectionsTracker.prototype = {
  born: function(conn) {
    var rootKey = conn.userEffigy.rootPublicKey, conns;
    if (!this.liveByRootKey.hasOwnProperty(rootKey)) {
      conns = this.liveByRootKey[rootKey] = [];
    }
    // check for any other connections by this already-existing client.
    else {
      conns = this.liveByRootKey[rootKey];
      for (var i = 0; i < conns.length; i++) {
        var othConn = conns[i];
        // found another connection; close it.
        if (othConn.conn.clientPublicKey === conn.conn.clientPublicKey) {
          // XXX log something about this probably
          othConn.conn.close();
        }
      }
    }
    this.liveByRootKey[rootKey].push(conn);
  },

  died: function(conn) {
    var rootKey = conn.userEffigy.rootPublicKey;
    var conns = this.liveByRootKey[rootKey];
    conns.splice(conns.indexOf(conn), 1);
    if (!conns.length)
      delete this.liveByRootKey[rootKey];
  },

  notifyOthersOfReplicaBlock: function(conn, replicaBlock) {
    var rootKey = conn.userEffigy.rootPublicKey;
    var conns = this.liveByRootKey[rootKey];
    for (var i = 0; i < conns.length; i++) {
      var othConn = conns[i];
      if (othConn !== conn)
        othConn.otherClientGeneratedReplicaBlock(replicaBlock);
    }
  },

  notifyAllOfReplicaBlock: function(rootKey, replicaBlock) {
    if (!this.liveByRootKey.hasOwnProperty(rootKey))
      return;
    var conns = this.liveByRootKey[rootKey];
    for (var i = 0; i < conns.length; i++) {
      // XXX otherClientGeneratedReplicaBlock is a misnomer in this case
      conns[i].otherClientGeneratedReplicaBlock(replicaBlock);
    }
  },
};

var gConnTracker = exports.gConnTracker = new UserConnectionsTracker();

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
 *  again later, it will (using secret key cryptography) either:
 * - Tell us the plaintext along with an authenticator if the payload is
 *    something we should see.
 * - Give us a secret boxed blob so we can tell it again later.  While we can
 *    obviously establish a correlation between the secret blob and whatever
 *    may have been told to us in plaintext, the idea is that we do not persist
 *    this relationship so that if we are not currently compromised but do
 *    become compromised in the future, the attacker gains miminal information
 *    from what is already on disk.  (Note: this requires us to be careful
 *    about timestamps or other monotonic values that could establish a total
 *    ordering or correlation in the database.)
 *
 * The reason the client uses secret key cryptography is because no one but
 *  the clients needs to be able to verify the integrity of these things and
 *  it's also much much faster to do the secret key crypto.
 *
 *
 * We talk to the maildrop, mailsender, and fanout server roles via proxy
 *  objects that may either directly effect the requested changes (locally
 *  hosted) or do an reliable RPC-type thing (remote hosted).
 */
function ClientServicingConnection(conn, userEffigy) {
  this.conn = conn;
  this.config = conn.serverConfig;
  this.userEffigy = userEffigy;
  // note: this is not the same instance as a `UserMessageProcessor` holds.
  this.store = new $ustore.UserBehalfDataStore(userEffigy.rootPublicKey,
                                               conn.serverConfig.db);
  this.clientPublicKey = this.conn.clientPublicKey;

  gConnTracker.born(this, userEffigy);

  // start out backlogged until we get a deviceCheckin at least.
  this._replicaBacklog = true;
  this._replicaInFlight = false;

  this._bound_ackAction = this._needsbind_ackAction.bind(this);
  this._bound_peekHandler = this._needsbind_peekHandler.bind(this);
}
ClientServicingConnection.prototype = {
  INITIAL_STATE: 'init',

  __closed: function() {
    gConnTracker.died(this, this.userEffigy);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Action Processing
  _needsbind_ackAction: function() {
    this.conn.writeMessage({type: 'ackRequest'});
    return 'root';
  },

  //////////////////////////////////////////////////////////////////////////////
  // Replica Issues

  /**
   * The device tells us its current sequence id and its replication level so we
   *  know when its last update was and whether we need to force a re-sync.
   *
   * XXX currently we don't have the client tell us anything; we likely want
   *  to have them tell us the last nonce or auth we told them, depending on the
   *  replica block type.
   */
  _msg_init_deviceCheckin: function(msg) {
    return when(this.store.clientQueuePeek(this.clientPublicKey),
                this._bound_peekHandler
                // rejection pass-through is fine
               );
  },

  _needsbind_peekHandler: function(plist) {
    if (plist.length) {
      this.conn.writeMessage({type: 'replicaBlock', block: plist[0]});
      this._replicaInFlight = true;
      // (the ack will trigger another fetch, etc.)
    }
    else {
      // there was nothing, there must be no backlog
      this._replicaBacklog = false;
      this.conn.writeMessage({type: 'replicaCaughtUp'});
    }
    return 'root';
  },


  /**
   * Receive an ack about notifications from persistent subscriptions.
   *
   * XXX ideally this would be orthogonal/out-of-band versus our other
   *  message flows in here.  We need to make sure to bound the number of
   *  unacked updates we can have outstanding to not cause queue overflow
   *  in the authconn, especially if the client is pipelining its actions.
   */
  _msg_root_ackReplica: function(msg) {
    this._replicaInFlight = false;
    return when(this.store.clientQueueConsumeAndPeek(this.clientPublicKey),
                this._bound_peekHandler
                // rejection pass-through is fine
                );
  },

  otherClientGeneratedReplicaBlock: function(block) {
    if (this._replicaBacklog)
      return;
    if (this._replicaInFlight) {
      this._replicaBacklog = true;
      return;
    }
    this.conn.writeMessage({type: 'replicaBlock', block: block});
    this._replicaInFlight = true;
  },

  sendReplicaBlockToOtherClients: function(block) {
    if (!this.userEffigy.otherClientKeys.length)
      return true;

    // - enqueue it for all other replicas
    var otherClientKeys = this.userEffigy.otherClientKeys;
    var promises = [];
    for (var i = 0; i < otherClientKeys.length; i++) {
      promises.push(this.store.clientQueuePush(otherClientKeys[i], block));
    }

    // - notify any lives ones about the enqueueing
    var self = this;
    return when($Q.all(promises), function() {
                  gConnTracker.notifyOthersOfReplicaBlock(self, block);
                });
  },

  //////////////////////////////////////////////////////////////////////////////
  // Persistent Query Brainings

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
   * Conversation creation primarily consists of resending data to the fanout
   *  role (right now).  We do archive the replica block that contains the
   *  private key, but otherwise we just wait for the fanout server to parrot
   *  what we tell it back to us.  In the future we will probably use this to
   *  persist some "ghost" data so the user can see that they started a
   *  conversation if the server is taking a while, but it's not required in
   *  our initial fullpub configuration.
   */
  _msg_root_createConversation: function(msg) {
    return $Q.join(
      this.config.senderApi.sendPersonEnvelopeToServer(
        this.userEffigy.rootPublicKey,
        msg.toTransit,
        // is there a better way to know this?
        this.userEffigy.pubring.transitServerPublicKey),
      // create a new conversation with the metadata
      this._bound_ackAction
    );
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
   *     @key[userRootKey]{
   *       The root key of the user we are adding.
   *     }
   *     @key[userTellKey]{
   *       The tell key of the user we are adding.
   *     }
   *     @key[serverSelfIdent]{
   *       The server self-ident of the server we are
   *     }
   *     @key[replicaBlock ReplicaCryptoBlock]
   *   ]]
   * ]
   */
  _msg_root_addContact: function(msg) {
    // -
    var serverKey =
      $pubident.peekServerSelfIdentBoxingKeyNOVERIFY(msg.serverSelfIdent);

    return $Q.join(
      this.store.newContact(msg.userRootKey, msg.replicaBlock),
      // persist the data to our random-access store
      // enqueue for other (existing) clients
      this.sendReplicaBlockToOtherClients(msg.replicaBlock),
      // perform maildrop/fanout authorization
      this.config.dropApi.authorizeServerUserForContact(
        this.userEffigy.rootPublicKey, serverKey, msg.userTellKey),
      // ensure the sending layer knows how to talk to that user too
      this.config.senderApi.setServerUrlUsingSelfIdent(msg.serverSelfIdent),
      this._bound_ackAction
    );
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
  // initialize our db

  $ustore.initializeUserTable(serverConfig.db);

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
