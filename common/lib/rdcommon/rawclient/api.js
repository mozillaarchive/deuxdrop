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
    'xmlhttprequest',
    'timers',
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
    $xmlhttprequest,
    $timers,
    $module,
    exports
  ) {
const when = $Q.when;

const NS_ERRORS = 'errors';

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
                serverUrl, 'signup.deuxdrop', _logger);
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
                serverUrl, 'mailstore.deuxdrop', _logger);
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

  __closed: function(reasonProvided) {
    if (reasonProvided && (reasonProvided.type === 'authFailure'))
      this._owner._mailstoreDoesNotKnowWhoWeAre();
    // tell our owner we are dead so it can deal
    else
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
  _msg_root_ackRequest: function(msg) {
    this.pendingAction = false;
    this._owner._actionCompleted(msg);
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
function RawClientAPI(persistedBlob, dbConn, isFirstRun, _logger) {
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
  if (selfIdentPayload.transitServerIdent) {
    this._transitServerBlob = selfIdentPayload.transitServerIdent;
    this._transitServer = $pubident.assertGetServerSelfIdent(
                            this._transitServerBlob);
  }
  else {
    this._transitServerBlob = null;
    this._transitServer = null;
  }
  this._poco = selfIdentPayload.poco;

  // -- create store
  this.store = new $localdb.LocalStore(dbConn, this._keyring, this._pubring,
                                       isFirstRun, this._log);
  this._notif = this.store._notif;


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

  this._accountListener = null;

  /**
   * @listof[@dict[
   *   @key[errorId]
   *   @key[errorParam]
   *   @key[firstReported DateMS]
   *   @key[lastReported DateMS]
   *   @key[reportedCount Number]
   *   @key[userActionRequired Boolean]
   *   @key[permanent Boolean]
   * ]]
   */
  this._publishedErrors = [];
}
RawClientAPI.prototype = {
  toString: function() {
    return '[RawClientAPI]';
  },
  toJSON: function() {
    return {type: 'RawClientAPI'};
  },

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
      this._conn.sendAction(this._actionQueue[0].msg);
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
      var self = this;
      $timers.setTimeout(function() {
        if (!self._conn)
          self._connect();
      }, this._RECONNECT_DELAY_MS);
    }
  },

  /**
   * A notification from our `MailstoreConn` friend that the server closed its
   *  connection claiming it had never heard of us.  This is likely/hopefully
   *  due to a development server having its database blown away.  (A server
   *  that otherwise loses its databases should probably generate new keys,
   *  etc.)
   *
   * Our responses to this problem:
   * - We nuke the server binding from our self-ident/etc. so that next startup
   *    the client should properly detect that we need to perform server signup.
   * - We generate an error that is exposed to error queries.
   * - XXX we should really either nuke most/all of our local datastore or
   *    attempt to reconstitute the server's world-view from our own world-view.
   *    The former is obviously potentially data-lossy which is why we aren't
   *    doing that right now.
   */
  _mailstoreDoesNotKnowWhoWeAre: function() {
    // - clear out our reference to the server
    this._transitServerBlob = null;
    this._transitServer = null;
    // (this will notify the account listener who should persist the change)
    this._regenerateSelfIdent();
    this.publishError('serverDoesNotKnowWhoWeAre', '',
                      { userActionRequired: true, permanent: true });
  },

  _actionCompleted: function(replyMsg) {
    // we only eat the action now that it's completed
    var actionRequest = this._actionQueue.shift();
    if (actionRequest.deferred)
      actionRequest.deferred.resolve(replyMsg);
    if (this._actionQueue.length)
      this._conn.sendAction(this._actionQueue[0].msg);
    else
      this._log.allActionsProcessed();
  },

  _replicaCaughtUp: function() {
    this._log.replicaCaughtUp();
    this.store.replicaCaughtUp();
  },

  //////////////////////////////////////////////////////////////////////////////
  // Actions

  /**
   * (Theoretically) persistently enqueue an action for reliable dispatch to
   *  the server.  This action should persist until we manage to deliver it
   *  to our mailstore server.
   */
  _enqueuePersistentAction: function(msg) {
    this._actionQueue.push({msg: msg, deferred: null});
    if (!this._connectionDesired)
      this.connect();
    else if (this._conn && !this._conn.pendingAction)
      this._conn.sendAction(this._actionQueue[0].msg);
  },

  /**
   * Send a message to the server and notify us via promise when it completes.
   *  In the event of power loss/system shutdown, the action will be discarded.
   * XXX support some means of cancelation in case the caller changes their
   *  mind before our callback completes.
   */
  _enqueueEphemeralActionAndResolveResult: function(msg) {
    var deferred = $Q.defer();
    this._actionQueue.push({msg: msg, deferred: deferred});
    if (!this._connectionDesired)
      this.connect();
    else if (this._conn && !this._conn.pendingAction)
      this._conn.sendAction(this._actionQueue[0].msg);
    return deferred.promise;
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
  // Account Persistence Support
  //
  // Allows account persistence logic to know when we have changed our
  //  self-ident or the like.

  registerForAccountChangeNotifications: function(listener) {
    this._accountListener = listener;
  },

  //////////////////////////////////////////////////////////////////////////////
  // Identity Changing

  _regenerateSelfIdent: function(doNotNotify) {
    this._selfIdentBlob = $pubident.generatePersonSelfIdent(
                            this._longtermKeyring, this._keyring,
                            this._poco, this._transitServerBlob);
    // and our dubious self other-ident...
    this._selfOthIdentBlob = $pubident.generateOtherPersonIdent(
                               this._longtermKeyring, this._selfIdentBlob,
                               this._poco);
    this._pubring = $pubring.createPersonPubringFromSelfIdentDO_NOT_VERIFY(
                      this._selfIdentBlob);

    if (!doNotNotify && this._accountListener)
      this._accountListener.accountChanged(this);

    // Save our self other-ident into the database so when we end up presenting
    //  ourself as a peep we look like a contact.
    this.store.saveOurOwnSelfIdents(this._selfIdentBlob,
                                    this._selfOthIdentBlob);
  },

  getPoco: function() {
    return this._poco;
  },

  updatePoco: function(newPoco) {
    this._poco = newPoco;
    this._regenerateSelfIdent();
  },

  //////////////////////////////////////////////////////////////////////////////
  // Server Signup

  /**
   * Retrieve a server's self-ident using via its domain name in a completely
   *  insecure fashion.  See `signupDangerouslyUsingDomainName` for the broad
   *  strokes on why this is a horrible idea.
   */
  insecurelyGetServerSelfIdentUsingDomainName: function(domain) {
    // Fetch the well-known location for the selfIdent
    var deferred = $Q.defer(),
        request = new $xmlhttprequest.XMLHttpRequest();

    request.open('GET', 'http://' + domain +
                 '/.well-known/deuxdrop-server.selfident.json', true);

    var self = this;
    request.onreadystatechange = function(evt) {
      if (request.readyState == 4) {
        if (request.status == 200) {
          self._log.insecurelyGetServerSelfIdentUsingDomainNameSuccess();
          var json = JSON.parse(request.responseText);
          deferred.resolve(json);
        } else {
          self._log.insecurelyGetServerSelfIdentUsingDomainNameFailure();
          deferred.resolve(null);
        }
      }
    };
    request.send(null);

    return deferred.promise;
  },

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

    this._transitServerBlob = serverSelfIdentBlob;
    var serverSelfIdent = this._transitServer =
      $pubident.assertGetServerSelfIdent(serverSelfIdentBlob);

    // - regenerate our selfIdentBlob using the server as the transit server
    this._regenerateSelfIdent(true); // we will explicitly notify on success

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

      if (self._accountListener)
        self._accountListener.accountChanged(self);
    });
  },

  /**
   * Assume we are already signed up with a server via other means.
   */
  useServerAssumeAlreadySignedUp: function(serverSelfIdentBlob) {
    this._transitServerBlob = serverSelfIdentBlob;
    var serverSelfIdent = this._transitServer =
      $pubident.assertGetServerSelfIdent(serverSelfIdentBlob);

    // - regenerate our selfIdentBlob using the server as the transit server
    this._regenerateSelfIdent();
  },

  //////////////////////////////////////////////////////////////////////////////
  // Phonebook

  /**
   * Ask our mailstore to find a bunch of possible friends.  This is currently
   *  handled by having the (assumed fullpub) server ask itself and all the
   *  servers in `serverlist.js` for their public identities and concatenating
   *  them.
   * We do filter ourself and anyone who is already our friend from the list.
   */
  queryServerForPossibleFriends: function(queryHandle) {
    var self = this;
    return when(
      $Q.all([
        this._enqueueEphemeralActionAndResolveResult({type: 'findFriends'}),
        this.store.getRootKeysForAllContacts(),
      ]),
      function success(results) {
        var msg = results[0], knownFriendRootKeys = results[1],
            myRootKey = self.rootPublicKey;

        // - filter out us, existing friends
        var selfIdentBlobs = msg.selfIdentBlobs, blobsAndPayloads = [];
        for (var i = 0; i < selfIdentBlobs.length; i++) {
          var identBlob = selfIdentBlobs[i];
          // We are the client, so it's okay for us to pay the assertion
          //  checking cost, except that we are not capping the size of our
          //  queries, so this could be some ridiculously large N.  As such,
          //  since we have a hard-coded list of servers that we control that
          //  tell us things, we will currently rely on their integrity to
          //  provide some degree of confidence about the validity of the blob.
          //  The good news is that we will check the assertion again if our
          //  user actually attempts to connect to the person.
          var identPayload = $pubident.peekPersonSelfIdentNOVERIFY(identBlob);

          var identRootKey = identPayload.root.rootSignPubKey;
          if (identRootKey === myRootKey ||
              knownFriendRootKeys.indexOf(identRootKey) !== -1)
            continue;
          blobsAndPayloads.push({name: identPayload.poco.displayName,
                                 blob: identBlob, payload: identPayload});
        }

        // - sort them alphabetically by display name
        // (we are really doing this for the unit test, but humans will like it
        //  too.)
        blobsAndPayloads.sort(function(a, b) {
          return a.name.localeCompare(b.name);
        });
        return blobsAndPayloads;
      }); // rejection pass-through is fine.
  },

  //////////////////////////////////////////////////////////////////////////////
  // Peep Relationships

  /**
   * XXX speculative webfinger support that is NOT implemented but would go here
   *  if it was.
   *
   * Initiate the connection process using webfinger.  Steps from our
   *  perspective look like:
   *
   * - We perform a webfinger lookup on the given address, netting us the XRD.
   *    We fail if the lookup fails, there is no XRD, or the XRD does not
   *    name a deuxdrop self-ident.
   * - We fetch the deuxdrop self-ident.
   * - We use the self-ident connect mechanism.
   */
  connectToPeepUsingWebfinger: function(email, optionalMessage) {
  },

  connectToPeepUsingSelfIdent: function(personSelfIdentBlob, localPoco,
                                        messageText) {
    var identPayload = $pubident.assertGetPersonSelfIdent(personSelfIdentBlob);
    var othPubring = $pubring.createPersonPubringFromSelfIdentDO_NOT_VERIFY(
      personSelfIdentBlob);

    // XXX temporary simplification: copy out the displayName so we can be sure
    //  it's always in the poco.
    if (!localPoco.hasOwnProperty("displayName"))
      localPoco.displayName = identPayload.poco.displayName;

    // generate and secretbox an OtherPersonIdentPayload for replica purposes
    var otherPersonIdentBlob = $pubident.generateOtherPersonIdent(
      this._longtermKeyring, personSelfIdentBlob, localPoco);

    // this will get told to us once the connect process has completed
    var replicaBlock = this.store.generateReplicaCryptoBlock(
      'addContact', identPayload.root.rootSignPubKey, otherPersonIdentBlob);

    var now = Date.now(), nonce = $keyops.makeBoxNonce();
    // - request body (for client)
    var requestBody = {
      otherPersonIdent: otherPersonIdentBlob,
      selfIdent: this._selfIdentBlob,
      messageText: messageText,
    };
    var boxedRequestBody = this._keyring.boxUtf8With(
                             JSON.stringify(requestBody), nonce,
                             othPubring.getPublicKeyFor('messaging', 'bodyBox'),
                             'messaging', 'tellBox');
    // - request env (for mailstore)
    var requestEnv = {
      type: 'contactRequest',
      body: boxedRequestBody,
    };
    var boxedRequestEnv = this._keyring.boxUtf8With(
      JSON.stringify(requestEnv), nonce,
      othPubring.getPublicKeyFor('messaging', 'envelopeBox'),
      'messaging', 'tellBox');

    // - request transit (for maildrop)
    var requestTransitInner = {
      envelope: boxedRequestEnv,
    };
    var boxedRequestTransitInner = this._keyring.boxUtf8With(
      JSON.stringify(requestTransitInner), nonce,
      othPubring.transitServerPublicKey,
      'messaging', 'tellBox');
    var requestTransitOuter = {
      name: identPayload.keys.tellBoxPubKey,
      senderKey: this._keyring.getPublicKeyFor('messaging', 'tellBox'),
      nonce: nonce,
      innerEnvelope: boxedRequestTransitInner,
    };

    this._enqueuePersistentAction({
      type: 'reqContact',
      userRootKey: identPayload.root.rootSignPubKey,
      userTellKey: identPayload.keys.tellBoxPubKey,
      serverSelfIdent: identPayload.transitServerIdent,
      toRequestee: requestTransitOuter,
      replicaBlock: replicaBlock
    });

    // XXX we should surface a peep rep or nothing at all, not this (testhack)
    return otherPersonIdentBlob;
  },

  /**
   * Reject a connection request.
   */
  rejectConnectRequest: function(rootKey, receivedAt, reportAs) {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Peep Mutation

  pinPeep: function(peepRootKey, peepMeta) {
    // (we already have the meta-data for the peep)

    var replicaBlock = this.store.generateAndPerformReplicaCryptoBlock(
      'metaContact', peepRootKey, peepMeta);
    this._enqueuePersistentAction({
      type: 'metaContact',
      userRootKey: peepRootKey,
      replicaBlock: replicaBlock,
    });
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

    var addPayloads = [], joinNonces = [];

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

      joinNonces.push(inviteInfo.attestSNonce);

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
    this._enqueuePersistentAction({
      type: 'createConversation',
      toTransit: ccpsOuterEnvelope
    });

    return {
      convId: convMeta.id,
      msgNonce: msgInfo.nonce,
      convMeta: convMeta,
      joinNonces: joinNonces,
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
    this._enqueuePersistentAction({
      type: 'convMessage',
      toTransit: psOuterEnvelope,
      toServer: convMeta.transitServerKey,
    });

    return {
      msgNonce: msgInfo.nonce,
    };
  },
  inviteToConversation: function(convMeta, peepOIdent, peepPubring) {
    // - create the invitation
    var inviteInfo = $msg_gen.createConversationInvitation(
      this._keyring, peepOIdent, convMeta, peepPubring);

    // - create the add/join message
    var joinConvOuterEnv = $msg_gen.createConversationAddJoin(
      this._keyring, this.transitServerPublicKey,
      convMeta, peepPubring, inviteInfo);

    // - send it to the invitee's maildrop/fan-in role
    this._enqueuePersistentAction({
      type: 'convMessage',
      toTransit: joinConvOuterEnv,
      toServer: peepPubring.transitServerPublicKey,
    });

    return {
      // the nonce of record is that used for the attestation... dubious.
      msgNonce: inviteInfo.attestSNonce,
    };
  },

  /**
   * Pin/unpin a conversation.
   */
  pinConversation: function(convId, pinned) {
    var replicaBlock = this.store.generateAndPerformReplicaAuthBlock(
      'setConvMeta', convId,
      {
        pinned: pinned,
      });
    this._enqueuePersistentAction({
      type: 'convMeta',
      replicaBlock: replicaBlock,
    });
  },
  /**
   * Update our read watermark for the conversation, updating both our unread
   *  counts and relaying to the rest of the participants in a conversation so
   *  they can know we have read the message.
   *
   * This logic will always generate a message, even if the data provided is
   *  equal to the already-broadcast data, so callers should be sure to not
   *  invoke us redundantly.
   */
  updateWatermarkForConversation: function(conversation, seenMarkValue) {

  },

  /*
  deleteConversation: function(conversation) {
  },
  */

  //////////////////////////////////////////////////////////////////////////////
  // Error Tracking

  _findPublishedError: function(errorId, errorParam) {
    var errs = this._publishedErrors;
    for (var i = 0; i < errs.length; i++) {
      var curErr = errs[i];

      if (curErr.errorId === errorId && curErr.errorParam === errorParam)
        return curErr;
    }
    return null;
  },

  /**
   * Publish an error to the UI(s).  Rather than provide a log style stream of
   *  errors to the user, we instead try and track the set of current failures
   *  and present them with simple statistics and an indication of whether the
   *  errors require user action and/or the likely permanence of the problem.
   *  In terms of statistics, this means being able to say "we have been
   *  unable to contact the server for 2 hours and 17 attempts."
   *
   * @args[
   *   @param[errorId String]{
   *     The error identifier which names the type of error and provides the
   *     string localization lookup for the error.
   *   }
   *   @param[errorParam String]{
   *     The parameter for this error; combined with the `errorId` to form
   *     a unique error identifier, only one of which may exist at a time.
   *   }
   *   @param[details @dict[
   *     @key[userActionRequired Boolean]
   *     @key[permanent Boolean]
   *   ]]
   * ]
   */
  publishError: function(errorId, errorParam, details) {
    var err = this._findPublishedError(errorId, errorParam),
        uniqueId = errorId + ":" + errorParam,
        now = Date.now(),
        indexValues = null;
    if (err) {
      err.lastReported = now;
      err.reportedCount++;

      indexValues = [
        ['firstReported', '', uniqueId, err.firstReported],
      ];
      // we pass nulls for cells and the client data populater because there
      //  is no filtering support for error queries so an item can't suddenly
      //  match a query it didn't match before.
      this._notif.namespaceItemModified(
        NS_ERRORS, uniqueId, null, null, null, null,
        function errorDelta() {
          return {
            lastReported: now,
            reportedCount: err.reportedCount,
          };
        });
    }
    else {
      err = {
        uniqueId: uniqueId,
        errorId: errorId,
        errorParam: errorParam,
        firstReported: now,
        lastReported: now,
        reportedCount: 1,
        userActionRequired: details.userActionRequired || false,
        permanent: details.permanent || false,
      };
      indexValues = [
        ['firstReported', '', uniqueId, now],
      ];

      this._notif.namespaceItemAdded(NS_ERRORS, uniqueId,
                                     null, null, indexValues,
                                     err, err);
    }
  },

  queryAndWatchErrors: function(queryHandle) {
    queryHandle.index = 'firstReported';
    queryHandle.indexParam = '';
    queryHandle.testFunc = function() { return true; };
    queryHandle.cmpFunc = function(aClientData, bClientData) {
      return aClientData.data.firstReported - bClientData.data.firstReported;
    };

    var viewItems = [], clientDataItems = null;
    queryHandle.items = clientDataItems = [];
    queryHandle.splices.push({index: 0, howMany: 0, items: viewItems});

    var errs = this._publishedErrors,
        querySource = queryHandle.owner;
    for (var i = 0; i < errs.length; i++) {
      var curErr = errs[i];
      var clientData = this._notif.reuseIfAlreadyKnown(queryHandle, NS_ERRORS,
                                                       curErr.uniqueId);
      if (!clientData) {
        var localName = "" + (querySource.nextUniqueIdAlloc++);
        clientData = {
          localName: localName,
          fullName: curErr.uniqueId,
          count: 1,
          data: curErr,
          indexValues: [],
          deps: null,
        };
        queryHandle.membersByLocal[NS_ERRORS][localName] = clientData;
        queryHandle.membersByFull[NS_ERRORS][curErr.uniqueId] = clientData;
        queryHandle.dataMap[NS_ERRORS][localName] = curErr;
      }

      viewItems.push(clientData.localName);
      clientDataItems.push(clientData);
    }

    this._notif.sendQueryResults(queryHandle);
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

  var persistedBlob = {
    selfIdent: personSelfIdentBlob,
    selfOthIdent: personSelfOthIdentBlob,
    keyrings: {
      root: rootKeyring.data,
      longterm: longtermKeyring.data,
      general: keyring.data,
    },
    otherClientAuths: [],
  };

  return new RawClientAPI(persistedBlob, dbConn, true, _logger);
};

/**
 * Create a new client from a pre-existing blob; this is intended only for
 *  weird cloning variations and `getClientForExistingIdentityFromStorage` is
 *  probably what you want to use if you are on a device.
 */
exports.getClientForExistingIdentity = function(persistedBlob, dbConn,
                                                _logger, forceBeNew) {
  return new RawClientAPI(persistedBlob, dbConn, Boolean(forceBeNew), _logger);
};

var LOGFAB = exports.LOGFAB = $log.register($module, {
  rawClient: {
    // we are a client/server client, even if we are smart for one
    type: $log.DAEMON,
    subtype: $log.CLIENT,
    topBilling: true,
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
    TEST_ONLY_events: {
      insecurelyGetServerSelfIdentUsingDomainNameSuccess: {selfIdent: true},
    },
    events: {
      signedUp: {},
      signupChallenged: {},
      insecurelyGetServerSelfIdentUsingDomainNameSuccess: {},

      connecting: {},
      connected: {},
      disconnected: {},

      allActionsProcessed: {},
      replicaCaughtUp: {},
    },
    errors: {
      signupFailure: {},
      insecurelyGetServerSelfIdentUsingDomainNameFailure: {}
    },
  }
});

}); // end define
