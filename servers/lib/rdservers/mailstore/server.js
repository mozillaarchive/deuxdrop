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
    'timers',
    'rdcommon/log',
    'rdcommon/identities/pubident',
    'rdcommon/serverlist',
    'rdservers/signup/phonebook-client',
    './ustore',
    'exports'
  ],
  function(
    $Q,
    $timers,
    $log,
    $pubident,
    $serverlist,
    $phonebook_client,
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
        othConn.heyAReplicaBlock(replicaBlock);
    }
  },

  notifyAllOfReplicaBlock: function(rootKey, replicaBlock) {
    if (!this.liveByRootKey.hasOwnProperty(rootKey))
      return;
    var conns = this.liveByRootKey[rootKey];
    for (var i = 0; i < conns.length; i++) {
      conns[i].heyAReplicaBlock(replicaBlock);
    }
  },
};

/**
 * Receives requests from the client and services them in a synchronous fashion.
 *  The client is allowed to send subsequent requests before we acknowledge
 *  the completion of a given request (up to the limit allowed by authconn)
 *  in order to effect pipelining.
 * We don't have a strong rationale for doing this versus
 *  letting it send an unbounded series of commands that we work off in a queue.
 *  I think the initial idea was that many of the commands might have return
 *  values with some combination of desire to make it harder to be a bad actor
 *  through an inherently flow-controlled model.  It is turning out that return
 *  values may not actually happen in any way that matters (aka: affecting
 *  whether the client would send subsequent messages), and that the uproc
 *  model means processing is ending up queue-processing anyways.  (And bad
 *  actor fighting can mean we just bound how many messages can be crammed in
 *  the queue.)
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

  this.uproc =
    this.config.storeApi.procRegistry.getUserMessageProcessorUsingEffigy(
      userEffigy);
  this.store = this.uproc.store;

  this.clientPublicKey = this.conn.clientPublicKey;

  this.config.userConnTracker.born(this, userEffigy);

  // start out backlogged until we get a deviceCheckin at least.
  this._replicaBacklog = true;
  this._replicaInFlight = false;

  this._bound_ackAction = this._needsbind_ackAction.bind(this);
  this._bound_peekHandler = this._needsbind_peekHandler.bind(this);
}
exports.ClientServicingConnection = ClientServicingConnection;
ClientServicingConnection.prototype = {
  INITIAL_STATE: 'init',

  __closed: function() {
    this.config.userConnTracker.died(this, this.userEffigy);
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

  /**
   * Notification from the `UserConnectionsTracker` that the provided
   *  replica block has been enqueued for our consumption.
   */
  heyAReplicaBlock: function(block) {
    if (this._replicaBacklog)
      return;
    if (this._replicaInFlight) {
      this._replicaBacklog = true;
      return;
    }
    this.conn.writeMessage({type: 'replicaBlock', block: block});
    this._replicaInFlight = true;
  },

  /**
   * Created as a means to send replica blocks to only other clients.  Currently
   *  unused but presumably it or a variant will be required again once we start
   *  pushing more metadata around.  (We will likely want it to live in uproc
   *  since meta-data will want to bounce off the serialization world view and
   *  be subject to subscriptions, batching, deferral, etc.)
   */
  sendReplicaBlockToOtherClients: function(block) {
    if (this.userEffigy.allClientKeys.length === 1)
      return true;

    // - enqueue it for all other replicas
    var allClientKeys = this.userEffigy.allClientKeys;
    var promises = [];
    for (var i = 0; i < allClientKeys.length; i++) {
      var clientKey = allClientKeys[i];
      if (clientKey === this.clientPublicKey)
        continue;
      promises.push(this.store.clientQueuePush(clientKey, block));
    }

    // - notify any lives ones about the enqueueing
    var self = this;
    return when($Q.all(promises), function() {
                  self.config.userConnTracker.notifyOthersOfReplicaBlock(
                    self, block);
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
  // Phonebook Searches

  /**
   * Ask ourselves and all the servers we know for their list of public peeps
   *  so we can report them to our client so it can make new friends.  It is up
   *  to the client to filter out any friends it already knows about (if it
   *  wants to.)
   * We do this by spinning off connections in parallel.
   */
  _msg_root_findFriends: function(msg) {
    var deferred = $Q.defer(), self = this;
    var allKnownServers = $serverlist.serverSelfIdents, iServer,
        useServerIdents = [], mySelfIdentBlob = this.config.selfIdentBlob,
        peepSelfIdents = [], serverIdentPayload;
    // -- figure out what servers to ask
    for (iServer = 0; iServer < allKnownServers.length; iServer++) {
      var serverSelfIdentBlob = allKnownServers[iServer].selfIdent;
      // ignore ourselves
      if (serverSelfIdentBlob === mySelfIdentBlob)
        continue;
      serverIdentPayload = $pubident.peekServerSelfIdentNOVERIFY(
                             serverSelfIdentBlob);
      // ignore servers that have "development" in the displayName or lack
      //  a valid meta
      if (!serverIdentPayload.meta || !serverIdentPayload.meta.displayName ||
          /development/.test(serverIdentPayload.meta.displayName))
        continue;

      useServerIdents.push(serverIdentPayload);
    }

    var timeoutId = null;
    function sendAndBeDone() {
      // acknowledge the request with a payload
      self.conn.writeMessage({
        type: 'ackRequest',
        selfIdentBlobs: peepSelfIdents,
      });
      // (and stay in the root state)
      deferred.resolve('root');
      if (timeoutId !== null)
        $timers.clearTimeout(timeoutId);
    }
    var pendingCount = 1;
    function gotSomeIdents(newPeepSelfIdents) {
      peepSelfIdents = peepSelfIdents.concat(newPeepSelfIdents);
      if (--pendingCount === 0)
        sendAndBeDone();
    }
    function phonebookProblem() {
      if (--pendingCount === 0)
        deferred.resolve(peepSelfIdents);
    }

    // -- ask ourselves
    when(this.config.authApi.phonebookScanPublicListing(),
         gotSomeIdents, phonebookProblem);

    // -- spin off parallel requests to the other servers
    for (iServer = 0; iServer < useServerIdents.length; iServer++) {
      pendingCount++;
      serverIdentPayload = useServerIdents[iServer];
      var pclient = new $phonebook_client.PhonebookClientConnection(
                      this.config.keyring, serverIdentPayload.publicKey,
                      serverIdentPayload.url, this.conn.log);
      when(pclient.promise, gotSomeIdents, phonebookProblem);
    }
    const PEEP_QUERY_TIMEOUT_MS = 1000;
    timeoutId = $timers.setTimeout(function() {
      timeoutId = null;
      sendAndBeDone();
    }, PEEP_QUERY_TIMEOUT_MS);

    return deferred.promise;
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
   * Add a message to a conversation; XXX we currently punt and do not generate
   *  a ghost for the outgoing message.
   */
  _msg_root_convMessage: function(msg) {
    return $Q.join(
      this.config.senderApi.sendPersonEnvelopeToServer(
        this.userEffigy.rootPublicKey,
        msg.toTransit,
        msg.toServer),
      // create a new conversation with the metadata
      this._bound_ackAction
    );
  },

  /**
   * Set meta-data on a conversation/messages.
   */
  _msg_root_convMeta: function(msg) {
  },

  /**
   * Delete messages in a conversation, possibly all of them.
   */
  _msg_root_delConvMsgs: function(msg) {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Contact Mutation

  /**
   * Request/approve the establishment of a contact relationship using
   *  webfinger.  The primary issue in contact establishment is making sure we
   *  know when both parties have agreed to be friends.  This is important
   *  because our UX does not want to deal with the pre-friend limbo state and
   *  so we have to know when success happens.  One pleasant side-effect of this
   *  decision is that it does allow our protocol to require the client to be
   *  involved in the process, allowing signatures to be fully verified.
   *
   * The general flow goes like this:
   *
   * - The client somehow gets the friendee's self-ident (possibly using
   *    webfinger).
   * - The client generates a friend request by composing a PS message to the
   *    friendee's transit server that identifies itself as a friend request.
   *    It contains a body-boxed message that contains a copy of the sender's
   *    self-ident.
   * - The client also generates a replica block to be released once the
   *    friending process completes.
   * - The client gives the mailstore the friend request message, the replica
   *    block, and the root and tell keys of the friendee.
   * - The mailstore verifies it does not already have a friend request on file
   *    from the friendee.  If it does, it sends the message and jumps to the
   *    success case.
   * - The mailstore files the pending request.
   * - Otherwise it asks the mailsender to send the request.
   *
   * - The mailsender contacts the recipient maildrop, tries to pass off the
   *    request.  XXX This is the most vulnerable part of the system, and will
   *    likely need to grow some form of proof-of-work/token bucket/whatever
   *    system for the initial cases.
   *
   * - The mailstore receives the request.
   * - The mailstore checks if it has its own pending request.  If it does, it
   *    declares success and releases the replica block to the clients. (Note:
   *    there is an assumption that our outgoing request has been or will
   *    eventually be received, leading to convergence.  We may need to require
   *    the protocol to show proof of round-tripped information, such as
   *    propagation of a nonce value in roundtrip fashion.)
   * - Since there is not a pending request, place the request in the
   *    appropriate storage for delivery/perusal by the client.
   * - Once the client receives the request, it is able to then issue a request
   *    of its own, issue a ban request, or leave the request around as
   *    something that can be acknowledged in the future.
   *
   * General attack models:
   * - Spamming by issuing friend requests with annoying requests.
   *   - P: Continually create new identities on trusted servers.
   *     - S: Provide feedback of bad actors so the server can rectify.
   *     - S: Penalize the server for not vetting its users sufficiently.
   *     - S: Require proof-of-work with upward-adjustable cost.
   *     - S: Allow requirement of FOAF-type vouchers.
   *     - S: Allow requirement of verification
   *   - P: Continually create new server keys with new identities, possibly
   *      astroturfing them into looking good by having sock-puppets on a
   *      trusted server friend made-up users on the new rogue server.
   *     - S: Proof-of-work requirements.
   *     - S: Penalize IP addresses/subnets.
   * - Attempt to impede "good" friend requests by using spam behavior.
   * - Denial of service attack.
   *
   * This affects the following roles idempotently like so:
   * - mailstore: Adds the contact to our address book.
   * - maildrop: Adds an authorization for the user to contact us.
   *
   * @args[
   *   @param[msg ClientRequestContact]
   * ]
   */
  _msg_root_reqContact: function(msg) {
    return when(this.uproc.issueContactRequest(msg), this._bound_ackAction);
  },

  /**
   * Modify the metadata associated with a contact.
   */
  _msg_root_metaContact: function(msg) {
    return $Q.join(
      this.store.metaContact(msg.userRootKey, msg.replicaBlock),
      this._bound_ackAction);
  },

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

exports.dbSchemaDef = $ustore.dbSchemaDef;

exports.makeServerDef = function(serverConfig) {
  serverConfig.userConnTracker = new UserConnectionsTracker();

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
