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
 * The raw client provides reliable low level interaction with a mailstore
 *  server while abstracting away key management concerns.  It is intended to
 *  exist on a background (non-UI) thread on the client device.  Interaction
 *  with the UI thread should be handled at a higher level that is aware of the
 *  UI's current "focus".  The UI API is being provided by the "moda" layer
 *  which operates as a cross-process bridge.
 *
 * It's a weak goal to try and make sure that the `RawClientAPI` can be used
 *  on its own without requiring the moda layer.
 *
 * "Reliable" in this sense means that the consumer of the API does not need to
 *  build its own layer to make sure we do the things it asks.
 *
 * Abstracting away key management concerns also roughly translates to
 *  "our consumers never touch crypto keys knowing they are crypto keys".  We
 *  may give them crypto keys as unique identifiers for simplicity/consistency,
 *  but at any point we could replace them with meaningless distinct identifiers
 *  and nothing should break.
 *
 * The in-memory representation divide goes something like this: the UI-thread
 *  wants the human-readable details on things plus related context and does not
 *  need nor should it have the crypto data.  The worker thread needs all the
 *  crypto stuff.
 * The memory caching trade-off goes like this: we usually don't need the crypto
 *  bits as they are only required when we are performing actions.  On the other
 *  hand, since the plan is always that the UI is never looking at a lot of data
 *  at a time, even moderate overhead on a small number of things is still a
 *  small amount of memory.  The counter-argument to that is that this also
 *  implies lower caching levels may be still be hot or warm enough that there's
 *  no need for us to be greedy and grab the data up-front.  Right now we
 *  opt for keeping everything around in-memory because it simplifies the logic
 *  and we are under development time pressure.
 **/

define(
  [
    'q',
    'rdcommon/log',
    'rdcommon/transport/authconn',
    'rdcommon/crypto/keyops', 'rdcommon/crypto/keyring',
    'rdcommon/identities/pubident', 'rdcommon/crypto/pubring',
    '../messages/generator',
    './localdb',
    'module',
    'exports'
  ],
  function(
    $Q,
    $log,
    $authconn,
    $keyops, $keyring,
    $pubident, $pubring,
    $msg_gen,
    $localdb,
    $module,
    exports
  ) {
var when = $Q.when;

/**
 * Connect to the server, give it the signup bundle, expose our result via a
 *  promise.
 */
function ClientSignupConn(selfIdentBlob, clientAuthBlobs, storeKeyringPersisted,
                          clientKeyring, serverPublicKey, serverUrl, _logger) {
  this._selfIdentBlob = selfIdentBlob;
  this._clientAuthBlobs = clientAuthBlobs;
  this._storeKeyringPersisted = storeKeyringPersisted;

  this.conn = new $authconn.AuthClientConn(
                this, clientKeyring, serverPublicKey,
                serverUrl, 'signup/signup', _logger);
  this._deferred = $Q.defer();
  this.promise = this._deferred.promise;
}
ClientSignupConn.prototype = {
  INITIAL_STATE: 'root',
  /**
   * When we've connected, send our request.
   */
  __connected: function() {
    this._sendSignup();
  },

  /**
   * If we get closed, issue a rejection without a challenge; this notification
   *  comes after any response processing, so we may just send the deferred
   *  something it ends up ignoring.
   */
  __closed: function() {
    this._deferred.reject(false);
  },

  /**
   * They did not like our signup, we will need to try again after resolving the
   *  challenge, if possible.
   */
  _msg_root_challenge: function(msg) {
    this._deferred.reject(msg.challenge);
    return this.conn.close();
  },

  /**
   * We are now signed up! Woo!
   */
  _msg_root_signedUp: function() {
    this._deferred.resolve(true);
    return this.conn.close();
  },

  _sendSignup: function() {
    this.conn.writeMessage({
      type: 'signup',
      selfIdent: this._selfIdentBlob,
      clientAuths: this._clientAuthBlobs,
      storeKeyring: this._storeKeyringPersisted,
      because: {
      },
    });
  },
};

/**
 * Long-duration mailstore connection.
 *
 * This connection if a friend/puppet of the `RawClientAPI` and provides no
 *  meaningful abstraction itself.  We aren't taking much advantage of the
 *  authconn abstraction because it is the client that holds the state and
 *  it must outlive the connection.
 */
function MailstoreConn(boxingKeyring, serverPublicKey, serverUrl,
                       owner, clientReplicaInfo, _logger) {
  this.conn = new $authconn.AuthClientConn(
                this, boxingKeyring, serverPublicKey,
                serverUrl, 'mailstore/mailstore', _logger);
  this._owner = owner;
  this._replicaInfo = clientReplicaInfo;

  // temporary flow control
  this.pendingAction = false;

  this._bound_ackProcessedReplicaBlock =
    this._needsbind_ackProcessedReplicaBlock.bind(this);
}
MailstoreConn.prototype = {
  INITIAL_STATE: 'root',

  __connected: function() {
    this.conn.writeMessage({
      type: 'deviceCheckin',
      replicaInfo: this._replicaInfo,
    });

    // tell our owner so it can feed us actions
    this._owner._mailstoreConnected(this);
  },

  __closed: function() {
    // tell our owner we are dead so it can deal
    this._owner._mailstoreDisconnected(this);
  },

  sendAction: function(actionMsg) {
    if (this.pendingAction)
      throw new Error("an action was already in-flight!");
    this.pendingAction = true;
    this.conn.writeMessage(actionMsg);
  },

  /**
   * Server acknowledging completion of a request we issued.
   */
  _msg_root_ackRequest: function() {
    this.pendingAction = false;
    this._owner._actionCompleted();
    return 'root';
  },

  /**
   * Server pushing updates to our subscribed replicas.
   */
  _msg_root_replicaBlock: function(msg) {
    return when(this._owner.store.consumeReplicaBlock(msg.block),
                this._bound_ackProcessedReplicaBlock
                // rejection pass-through is fine
               );
  },
  _needsbind_ackProcessedReplicaBlock: function() {
    this.conn.writeMessage({type: 'ackReplica'});
    return 'root';
  },

  /**
   * Server telling us we are caught up to what it believes to be realtime.
   */
  _msg_root_replicaCaughtUp: function() {
    this._owner._replicaCaughtUp();
    return 'root';
  },
};

/**
 *
 * For the time being, we are assuming the client always has all sets of
 *  its keyrings accessible to itself.
 *
 * == Relationship With Local Storage, Other Clients, Mailstore  ==
 *
 * All client actions result in either secretboxes or authenticated blobs which
 *  are fed to our LocalStore and to the mailstore.  The mailstore will process
 *  these to affect its storage and relay them to all other clients to process.
 *  The decision between a secretbox and an authenticated blob is made on the
 *  basis of whether the mailstore gets to know what we did.  In general, it
 *  gets to know what we did, although the specific details of what we did will
 *  very likely end up encrypted.
 *
 * While it is arguably redundant to have our local client generate an
 *  authenticator and then verify it, it does avoid us having to write a second
 *  code-path.
 */
function RawClientAPI(persistedBlob, dbConn, _logger) {
  this._dbConn = dbConn;

  // -- restore keyrings
  this._rootKeyring = $keyring.loadPersonRootSigningKeyring(
                        persistedBlob.keyrings.root);
  this._longtermKeyring = $keyring.loadLongtermSigningKeyring(
                            persistedBlob.keyrings.longterm);
  this._keyring = $keyring.loadDelegatedKeyring(
                             persistedBlob.keyrings.general);

  this._log = LOGFAB.rawClient(this, _logger,
    ['user', this._keyring.rootPublicKey,
     'client', this._keyring.getPublicKeyFor('client', 'connBox')]);

  // -- create store
  this.store = new $localdb.LocalStore(dbConn, this._keyring, this._log);

  // -- copy self-ident-blob, verify it, extract canon bits
  // (The poco bit is coming from here.)
  this._selfIdentBlob = persistedBlob.selfIdent;
  var selfIdentPayload = $pubident.assertGetPersonSelfIdent(
                           this._selfIdentBlob,
                           this._keyring.rootPublicKey);
  this._selfOthIdentBlob = persistedBlob.selfOthIdent;
  this._pubring = $pubring.createPersonPubringFromSelfIdentDO_NOT_VERIFY(
                    this._selfIdentBlob);

  this._otherClientAuths = persistedBlob.otherClientAuths;

  // XXX we are assuming a fullpub server config here...
  if (selfIdentPayload.transitServerIdent)
    this._transitServer = $pubident.assertGetServerSelfIdent(
                            selfIdentPayload.transitServerIdent);
  else
    this._transitServer = null;
  this._poco = selfIdentPayload.poco;


  /**
   * Signup connection; it should only be in play when signing up.
   */
  this._signupConn = null;
  /**
   * Server mailstore connection.
   */
  this._conn = null;

  /**
   * Do we want to be connected to the server?
   */
  this._connectionDesired = false;

  /**
   * Persistent list of action-taking messages.  This includes everything but
   *  webmail-style non-persistent data queries.
   */
  this._actionQueue = [];
}
RawClientAPI.prototype = {
  //////////////////////////////////////////////////////////////////////////////
  // Internal Client stuff

  /**
   * How long to wait before reconnecting; this is currently intended to be a
   *  sane-ish real-world value while also ensuring our tests will fail if we
   *  end up disconnecting and reconnecting.
   */
  _RECONNECT_DELAY_MS: 4000,

  _connect: function() {
    if (this._conn)
      throw new Error("Already connected!");
    if (!this._transitServer)
      throw new Error("No (transit) server configured!");

    this._log.connecting();
    this._conn = new MailstoreConn(
                   this._keyring.exposeSimpleBoxingKeyringFor('client',
                                                              'connBox'),
                   this._transitServer.publicKey, this._transitServer.url,
                   this, {/*XXX replica Info */}, this._log);
  },

  //////////////////////////////////////////////////////////////////////////////
  // MailstoreConn notifications

  /**
   * A notification from our `MailstoreConn` friend that it is connected and
   *  we can cram it full of stuff.
   */
  _mailstoreConnected: function() {
    this._log.connected();
    if (this._actionQueue.length && !this._conn.pendingAction)
      this._conn.sendAction(this._actionQueue[0]);
  },

  /**
   * A notification from our `MailstoreConn` friend that it is disconnected,
   *  meaning any actions not yet acked are not going to be acked.  Also, we
   *  should try and re-establish our connection if we believe the network is
   *  amenable, otherwise wait for it to get amenable.
   */
  _mailstoreDisconnected: function() {
    this._log.disconnected();
    this._conn = null;
    if (this._connectionDesired) {
    }
  },

  _actionCompleted: function() {
    // we only eat the action now that it's completed
    this._actionQueue.shift();
    if (this._actionQueue.length)
      this._conn.sendAction(this._actionQueue[0]);
    else
      this._log.allActionsProcessed();
  },

  _replicaCaughtUp: function() {
    this._log.replicaCaughtUp();
  },

  //////////////////////////////////////////////////////////////////////////////
  // Actions

  _enqueueAction: function(msg) {
    this._actionQueue.push(msg);
    if (!this._conn.pendingAction)
      this._conn.sendAction(this._actionQueue[0]);
  },

  get hasPendingActions() {
    return this._actionQueue.length > 0;
  },

  //////////////////////////////////////////////////////////////////////////////
  // Identity Info

  get rootPublicKey() {
    return this._keyring.rootPublicKey;
  },

  get longtermSigningPublicKey() {
    return this._keyring.signingPublicKey;
  },

  get tellBoxKey() {
    return this._keyring.getPublicKeyFor('messaging', 'tellBox');
  },

  /**
   * The client's boxing public key; it is not intended to be named to external
   *  parties other than us and the server at this type.
   */
  get clientPublicKey() {
    return this._keyring.getPublicKeyFor('client', 'connBox');
  },

  get transitServerPublicKey() {
    return this._pubring.transitServerPublicKey;
  },

  //////////////////////////////////////////////////////////////////////////////
  // Mailstore connection management.

  connect: function() {
    this._connectionDesired = true;
    if (!this._conn)
      this._connect();
  },

  disconnect: function() {
    this._connectionDesired = false;
    if (this._conn)
      this._conn.close();
  },

  //////////////////////////////////////////////////////////////////////////////
  // Server Signup

  /**
   * Connect to the server and ask it for its self-ident, then go from there.
   *  While this admittedly is a pretty bad idea, it's not as bad as it seems
   *  since in order for them to maintain a useful man-in-the-middle attack
   *  where the system looks like it is operating successfully while they can
   *  see everything, they need to:
   *
   * - Consistently intercept and respond to the client's requests to talk to
   *    the faux-server.  (Assuming we do error reporting correctly that we
   *    notice when our connections end up talking to the wrong server...)
   *
   * - Be the sole source for all key/identity information for the user.
   *
   * Better ideas where we can leverage existing crypto trust-chains that the
   *  user/device may already have include depending on the HTTPS/CA system or
   *  DNSSEC.  Mo better ideas include not using this method at all and instead
   *  using mobile-device to mobile-device chat to provide the self-ident.
   *
   * @return[Promise]
   */
  signupDangerouslyUsingDomainName: function() {
    throw new Error("not actually implemented right now");
  },

  /**
   * Connect to a server using the provided self-ident blob and attempt to
   *  signup with it.
   *
   * @args[
   *   @param[serverSelfIdentBlob ServerSelfIdentBlob]
   * ]
   * @return[Promise]{
   *   Promise that is resolved with true on sucecss or rejected with the
   *   challenge.
   * }
   */
  signupUsingServerSelfIdent: function(serverSelfIdentBlob) {
    if (this._signupConn)
      throw new Error("Still have a pending signup connection!");

    var serverSelfIdent = this._transitServer =
      $pubident.assertGetServerSelfIdent(serverSelfIdentBlob);

    // - regenerate our selfIdentBlob using the server as the transit server
    this._selfIdentBlob = $pubident.generatePersonSelfIdent(
                            this._longtermKeyring, this._keyring,
                            this._poco, serverSelfIdentBlob);
    // and our dubious self other-ident...
    this._selfOthIdentBlob = $pubident.generateOtherPersonIdent(
                               this._longtermKeyring, this._selfIdentBlob,
                               {});
    this._pubring = $pubring.createPersonPubringFromSelfIdentDO_NOT_VERIFY(
                      this._selfIdentBlob);

    // - signup!
    this._log.signup_begin();
    var clientAuthBlobs = [this._keyring.getPublicAuthFor('client')]
      .concat(this._otherClientAuths);
    this._signupConn = new ClientSignupConn(
                         this._selfIdentBlob, clientAuthBlobs,
                         this._keyring.exportKeypairForAgentUse('messaging',
                                                                'envelopeBox'),
                         this._keyring.exposeSimpleBoxingKeyringFor('client',
                                                                    'connBox'),
                         serverSelfIdent.publicKey,
                         serverSelfIdent.url,
                         this._log);
    var self = this;
    // Use the promise to clear our reference, but otherwise just re-provide it
    //  to our caller.
    return $Q.when(this._signupConn.promise, function(val) {
      if (val === true) {
        self._log.signedUp();
      }
      else if ($Q.isRejection(val)) {
        if (val.valueOf().reason === false)
          self._log.signupFailure();
        else
          self._log.signupChallenged();
      }

      self._signupConn = false;
      self._log.signup_end();
    });
  },

  /**
   * Assume we are already signed up with a server via other means.
   */
  useServerAssumeAlreadySignedUp: function(serverSelfIdentBlob) {
    var serverSelfIdent = this._transitServer =
      $pubident.assertGetServerSelfIdent(serverSelfIdentBlob);

    // - regenerate our selfIdentBlob using the server as the transit server
    this._selfIdentBlob = $pubident.generatePersonSelfIdent(
                            this._longtermKeyring, this._keyring,
                            this._poco, serverSelfIdentBlob);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Request Querying

  // email/time
  queryRequests: function() {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Peep Relationships

  connectToPeepUsingEmail: function(email, optionalMessage) {
  },
  rejectPeepUsingEmail: function(email, reportAs) {
  },

  connectToPeepUsingSelfIdent: function(personSelfIdentBlob, localPoco) {
    var identPayload = $pubident.assertGetPersonSelfIdent(personSelfIdentBlob);

    // generate and secretbox an OtherPersonIdentPayload for replica purposes
    var otherPersonIdentBlob = $pubident.generateOtherPersonIdent(
      this._longtermKeyring, personSelfIdentBlob, localPoco);

    var replicaBlock = this.store.generateAndPerformReplicaCryptoBlock(
      'addContact',
      {
        rootKey: identPayload.root.rootSignPubKey,
        oident: otherPersonIdentBlob,
      });

    this._enqueueAction({
      type: 'addContact',
      userRootKey: identPayload.root.rootSignPubKey,
      userTellKey: identPayload.keys.tellBoxPubKey,
      serverSelfIdent: identPayload.transitServerIdent,
      replicaBlock: replicaBlock
    });

    // XXX we should surface a peep rep or nothing at all, not this (testhack)
    return otherPersonIdentBlob;
  },

  //////////////////////////////////////////////////////////////////////////////
  // Peep Mutation

  pinPeep: function(peep) {
    // (we already have the meta-data for the peep)
    // - modify the blob
    // - generate a new attestation
  },


  //////////////////////////////////////////////////////////////////////////////
  // Conversation Mutation

  /**
   * Create a new conversation with an initial set of participants and an
   *  initial message sent to the conversation.  Under the hood this gets
   *  broken down into atomic ops: create conversation, invite+, send message.
   *
   * @return[@dict[
   *   @key[convId]
   *   @key[msgNonce]{
   *     The nonce used for the message payload.
   *   }
   * ]]
   */
  createConversation: function(peepOIdents, peepPubrings, messageText) {
    var iPeep;

    // - create the conversation
    var convBits = $msg_gen.createNewConversation(this._keyring,
                                                  this._selfIdentBlob,
                                                  this._transitServer);
    var convKeypair = convBits.keypair,
        convMeta = convBits.meta;

    var addPayloads = [];

    var useOIdents = [this._selfOthIdentBlob].concat(peepOIdents),
        useRecipPubrings = [this._pubring].concat(peepPubrings);


    // - generate the invitations for the peeps
    for (iPeep = 0; iPeep < useOIdents.length; iPeep++) {
      var otherPersonIdent = useOIdents[iPeep],
          recipPubring = useRecipPubrings[iPeep];
      var inviteInfo = $msg_gen.createConversationInvitation(
        this._keyring, otherPersonIdent, convMeta, recipPubring);
      var inviteProofInfo = $msg_gen.createInviteProof(
        this._keyring, convMeta, recipPubring);

      addPayloads.push({
        nonce: inviteInfo.nonce,
        tellKey: recipPubring.getPublicKeyFor('messaging', 'tellBox'),
        envelopeKey: recipPubring.getPublicKeyFor('messaging', 'envelopeBox'),
        serverKey: recipPubring.transitServerPublicKey,
        inviteePayload: inviteInfo.boxedInvite,
        attestationNonce: inviteInfo.attestSNonce,
        attestationPayload: inviteInfo.signedAttestation,
        inviteProof: inviteProofInfo.boxedInviteProof,
        proofNonce: inviteProofInfo.nonce,
      });
    }

    // - create the message
    var msgInfo = $msg_gen.createConversationHumanMessage(
                    messageText, this._keyring, convMeta);

    // - formulate the message to the fanout role
    var convCreatePayload = {
      addPayloads: addPayloads,
      msgNonce: msgInfo.nonce,
      msgPayload: msgInfo.payload,
    };
    var ccpsNonce = $keyops.makeBoxNonce();
    var ccpsInnerEnvelope = {
      type: 'createconv',
      convId: convMeta.id,
      payload: convCreatePayload,
    };
    var ccpsOuterEnvelope = {
      senderKey: this._keyring.getPublicKeyFor('messaging', 'tellBox'),
      nonce: ccpsNonce,
      innerEnvelope: this._keyring.boxUtf8With(
                       JSON.stringify(ccpsInnerEnvelope),
                       ccpsNonce,
                       convMeta.transitServerKey,
                       'messaging', 'tellBox'),
    };

    // - send the message
    this._enqueueAction({
      type: 'createConversation',
      toTransit: ccpsOuterEnvelope
    });

    return {
      convId: convMeta.id,
      msgNonce: msgInfo.nonce,
      convMeta: convMeta,
    };
  },
  replyToConversation: function(convMeta, messageText) {
    // - create the signed message wrapped in conversation crypto (body+env)
    var msgInfo = $msg_gen.createConversationHumanMessage(
                    messageText, this._keyring, convMeta);

    // - box it for transit to the fanout server
    // this is what makes the fanout server agree to re-publish it
    // (it can't see the payload)
    var psInnerEnvelope = {
      type: 'convmsg',
      convId: convMeta.id,
      payload: msgInfo.payload,
    };
    var psOuterEnvelope = {
      senderKey: this._keyring.getPublicKeyFor('messaging', 'tellBox'),
      nonce: msgInfo.nonce,
      innerEnvelope: this._keyring.boxUtf8With(
                       JSON.stringify(psInnerEnvelope),
                       msgInfo.nonce, // we can reuse the nonce
                       convMeta.transitServerKey,
                       'messaging', 'tellBox'),
    };
    this._enqueueAction({
      type: 'convMessage',
      toTransit: psOuterEnvelope,
      toServer: convMeta.transitServerKey,
    });

    return {
      msgNonce: msgInfo.nonce,
    };
  },
  inviteToConversation: function(conversation, peep) {
  },

  pinConversation: function(conversation, pinned) {
  },
  updateWatermarkForConversation: function(conversation, seenMarkValue) {
  },

  deleteConversation: function(conversation) {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Other Clients

  /**
   * Create a copy of this identity with a new client keypair.
   *
   * This is being created for unit testing reasons and likely does not
   *  represent a realistic use-case.
   */
  __forkNewPersistedIdentityForNewClient: function() {
    // - clone our longterm and normal keyrings
    // (it is vitally important we pass this through JSON so we deep copy!)
    var clonedLongtermKeyring = $keyring.loadLongtermSigningKeyring(
      JSON.parse(JSON.stringify(this._longtermKeyring.data)));
    var clonedKeyring = $keyring.loadDelegatedKeyring(
      JSON.parse(JSON.stringify(this._keyring.data)));

    // - have the clones generate a new keypair and clobber our keypair
    // (we do not want the other client to be able to impersonate us)
    clonedLongtermKeyring.forgetIssuedGroup('client');
    clonedKeyring.forgetKeyGroup('client');

    clonedKeyring.incorporateKeyGroup(
      clonedLongtermKeyring.issueKeyGroup('client', {conn: 'box'}, 'client'));

    // - persist ourself
    var persisted = this.__persist();

    // - replace the longterm and normal keyrings with our clones
    persisted.keyrings.longterm = clonedLongtermKeyring.data;
    persisted.keyrings.general = clonedKeyring.data;

    // - add our auth to the other client auths
    persisted.otherClientAuths.push(this._keyring.getPublicAuthFor('client'));

    // - finally, update our own list of other client auths with this new guy
    this._otherClientAuths = clonedKeyring.getPublicAuthFor('client');

    return persisted;
  },

  //////////////////////////////////////////////////////////////////////////////
  // Hygiene

  /**
   * Nuke data/subscriptions that we no longer have a reason to keep around.
   *  This should generally mean things aged out so that they are no longer
   *  recent or recently accessed.
   */
  __cullSubscriptions: function() {
  },

  __persist: function() {
    return {
      selfIdent: this._selfIdentBlob, // (immutable)
      selfOthIdent: this._selfOthIdentBlob, // (immutable)
      keyrings: { // (mutable)
        root: this._rootKeyring.data, // (atomic)
        longterm: this._longtermKeyring.data, // (atomic)
        general: this._keyring.data, // (atomic)
      },
      otherClientAuths: this._otherClientAuths.concat(), // (mutable of immut)
    };
  },

  //////////////////////////////////////////////////////////////////////////////
};

const TBL_IDENTITY_STORAGE = 'rawClient:persisted';

/**
 * Create a new identity using the provided portable contacts schema and using
 *  the provided db connection for persistance.
 */
exports.makeClientForNewIdentity = function(poco, dbConn, _logger) {
  // -- keys
  // - create the keyrings.
  var rootKeyring, longtermKeyring, keyring;

  rootKeyring = $keyring.createNewPersonRootKeyring();
  longtermKeyring = rootKeyring.issueLongtermSigningKeyring();
  keyring = longtermKeyring.makeDelegatedKeyring();

  // - create the messaging key group
  keyring.incorporateKeyGroup(
    longtermKeyring.issueKeyGroup('messaging', {
        envelope: 'box',
        body: 'box',
        announce: 'sign',
        tell: 'box',
      }));

  // - create the client key
  keyring.incorporateKeyGroup(
    longtermKeyring.issueKeyGroup('client', {conn: 'box'}, 'client'));

  // - create the client replica keys
  keyring.incorporateSecretBoxKey(
    longtermKeyring.generateSecretBoxKey('replicaSbox'));
  keyring.incorporateAuthKey(
    longtermKeyring.generateAuthKey('replicaAuth'));

  // -- create the server-less self-ident
  var personSelfIdentBlob = $pubident.generatePersonSelfIdent(
                              longtermKeyring, keyring,
                              poco, null);
  var personSelfOthIdentBlob = $pubident.generateOtherPersonIdent(
                                 longtermKeyring, personSelfIdentBlob,
                                 {});

  var clientAuthBlob = keyring.getPublicAuthFor('client');

  var persistedBlob = {
    selfIdent: personSelfIdentBlob,
    selfOthIdent: personSelfOthIdentBlob,
    keyrings: {
      root: rootKeyring.data,
      longterm: longtermKeyring.data,
      general: keyring.data,
    },
    clientAuth: clientAuthBlob,
    otherClientAuths: [],
  };

  return new RawClientAPI(persistedBlob, dbConn, _logger);
};

/**
 * Create a new client from a pre-existing blob; this is intended only for
 *  weird cloning variations and `getClientForExistingIdentityFromStorage` is
 *  probably what you want to use if you are on a device.
 */
exports.getClientForExistingIdentity = function(persistedBlob, dbConn,
                                                _logger) {
  return new RawClientAPI(persistedBlob, dbConn, _logger);
};

/**
 * Create client instance using its persisted state from storage on the given
 *  connection.  If there is no persisted state, returns null in which case
 *  you want to use `makeClientForNewIdentity`.
 * This returns a promise since database access is always async.
 *
 * XXX not currently implemented but desired
 */
exports.getClientForExistingIdentityFromStorage = function(dbConn, _logger) {
  return $Q.when(dbConn.getRowCell(TBL_IDENTITY_STORAGE, 'me', 'p:me'),
    function(jsonStr) {
      if (!jsonStr)
        return null;
      return new RawClientAPI(JSON.parse(jsonStr, dbConn, _logger));
    }
    // rejection pass-through is fine
  );
};

var LOGFAB = exports.LOGFAB = $log.register($module, {
  rawClient: {
    // we are a client/server client, even if we are smart for one
    type: $log.CONNECTION,
    subtype: $log.CLIENT,
    semanticIdent: {
      _l0: null,
      userIdent: 'key:root:user',
      _l1: null,
      clientIdent: 'key:client',
      _l2: null,
      serverIdent: 'key:server',
    },
    stateVars: {
      haveConnection: true,
    },
    asyncJobs: {
      signup: {},
    },
    events: {
      signedUp: {},
      signupChallenged: {},

      connecting: {},
      connected: {},
      disconnected: {},

      allActionsProcessed: {},
      replicaCaughtUp: {},
    },
    errors: {
      signupFailure: {},
    },
  }
});

}); // end define
