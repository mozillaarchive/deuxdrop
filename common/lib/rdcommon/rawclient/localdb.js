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
 * (A smart) client's local datastore consisting of local replicas of subsets of
 *  data whose canonical copies lives on the mailstore.  In some cases, such as
 *  peeps, we will have the entire dataset available locally.  In most other
 *  cases we will have recently new/updated, recently accessed, or marked as
 *  important subsets of data around.   Where data = conversations + messages.
 **/

define(
  [
    'q',
    'rdcommon/log',
    'rdcommon/taskidiom', 'rdcommon/taskerrors',
    'rdcommon/crypto/keyops', 'rdcommon/crypto/pubring',
    'rdcommon/messages/generator',
    'module',
    'exports'
  ],
  function(
    $Q,
    $log,
    $task, $taskerrors,
    $keyops, $pubring,
    $msg_gen,
    $module,
    exports
  ) {
var when = $Q.when;

const PINNED = 'pinned';

/**
 * Data on peeps, be they a contact or a transitive-acquaintance we heard of
 *  through a conversation.
 *
 * row id: root key
 *
 * - d:oident - The other person ident.
 * - d:meta - Full metadata dictionary object.
 * - d:nunread - The number of unread messages from this user.
 * - d:nconvs - The number of conversations involving the user.
 */
const TBL_PEEP_DATA = "peepData";
/**
 * Peeps by recency of messages they have written to conversations (the user is
 *  involved in).
 */
const IDX_PEEP_WRITE_INVOLVEMENT = "idxPeepWrite";
/**
 * Peeps by recency of messages the user have written to conversations they are
 *  in.
 */
const IDX_PEEP_RECIP_INVOLVEMENT = "idxPeepRecip";
/**
 * Peeps by recency of activity in any conversation they are involved in,
 *  even if it was just a third party in the coversation posting a message.
 */
const IDX_PEEP_ANY_INVOLVEMENT = "idxPeepAny";

/**
 * Conversation data.
 *
 * row id: conversation id
 *
 * - d:meta - The conversation meta-info for this conversation.
 * - d:s### - Self-ident for the given authorized participant by their tell
 *             key.  The payload may want to be normalized out and the name
 *             may want to become their root key.
 * - d:m - High message number
 * - d:m# - Message number #.  Fully decrypted rep.
 * - d:u### - Per-user metadata by tell key, primarily used for watermarks.
 * - d:ourmeta - Our user's metadata about the conversation, primarily used
 *                for pinned status.
 */
const TBL_CONV_DATA = "convData";
/**
 * The master conversation ordered view; all converations our user is in on.
 */
const IDX_ALL_CONVS = "idxConv";

/**
 * The per-peep conversation involvement view (for both contact and non-contact
 *  peeps right now.)
 */
const IDX_CONV_PEEP_WRITE_INVOLVEMENT = "idxPeepConvWrite";
const IDX_CONV_PEEP_RECIP_INVOLVEMENT = "idxPeepConvRecip";
const IDX_CONV_PEEP_ANY_INVOLVEMENT = "idxPeepConvAny";

/**
 * Database table names are exposed for use by `testhelper.js` instances so
 *  they can issue checks on database state that do not make sense to expose
 *  via explicit API's.
 */
exports._DB_NAMES = {
  TBL_CONV_DATA: TBL_CONV_DATA,
  IDX_ALL_CONVS: IDX_ALL_CONVS,
  IDX_CONV_PEEP_WRITE_INVOLVEMENT: IDX_CONV_PEEP_WRITE_INVOLVEMENT,
  IDX_CONV_PEEP_RECIP_INVOLVEMENT: IDX_CONV_PEEP_RECIP_INVOLVEMENT,
  IDX_CONV_PEEP_ANY_INVOLVEMENT: IDX_CONV_PEEP_ANY_INVOLVEMENT,

  TBL_PEEP_DATA: TBL_PEEP_DATA,
  IDX_PEEP_WRITE_INVOLVEMENT: IDX_PEEP_WRITE_INVOLVEMENT,
  IDX_PEEP_RECIP_INVOLVEMENT: IDX_PEEP_RECIP_INVOLVEMENT,
  IDX_PEEP_ANY_INVOLVEMENT: IDX_PEEP_ANY_INVOLVEMENT,
};

/**
 * XXX We currently assume there is a listener that cares about everything
 *  because the UI does indeed care about everything right now.
 */
function NotificationKing(store) {
  this._newishMessagesByConvId = {};
  this._store = store;


}
NotificationKing.prototype = {
  //////////////////////////////////////////////////////////////////////////////
  // Message Notifications
  //
  // Specialized message notification handling; required because the aggregation
  //  of messages into conversations is unique within our system.

  /**
   * Track a message that appears to be new but we won't know for sure until we
   *  are done with our update phase.
   */
  trackNewishMessage: function(convId, msgIndex, msgData) {
    var newishForConv;
    if (!this._newishMessagesByConvId.hasOwnProperty(convId))
      newishForConv = this._newishMessagesByConvId[convId] = [];
    else
      newishForConv = this._newishMessagesByConvId[convId];
    newishForConv.push({index: msgIndex, data: msgData});
  },

  /**
   * Moot potential new message events in the given conversation
   */
  mootNewForMessages: function(convId, firstUnreadMessage) {
    if (!this._newishMessagesByConvId.hasOwnProperty(convId))
      return;
    var newishForConv = this._newishMessagesByConvId[convId];
    var killUntil = 0;
    while (newishForConv[killUntil].index < firstUnreadMessage) {
      killUntil++;
    }
    if (killUntil === newishForConv.length)
      delete this._newishMessagesByConvId[convId];
    else if (killUntil)
      newishForConv.splice(0, killUntil);
  },

  //////////////////////////////////////////////////////////////////////////////
  // General

  /**
   * We are now up-to-speed and should generate any notifications we were
   *  holding off on because we were concerned a subsequent update would have
   *  mooted the notification.
   *
   * Update phases are defined as:
   * - When we first connect to the server until we work through our backlog.
   */
  updatePhaseDoneReleaseNotifications: function() {
    var store = this._store;

    // -- generate new message notifications
    for (var convId in this._newishMessagesByConvId) {
      var newishForConv = this._newishMessagesByConvId[convId];

      var msgDataItems = [];
      for (var i = 0; i < newishForConv.length; i++) {
        msgDataItems.push(newishForConv[i].data);
      }

      store.__notifyNewMessagesInConversation(convId, msgDataItems);
    }
  },

  /**
   * A completely new-to-us peep/whatever has come into existence.  The new
   *  thing needs to be checked for eligible sets and update any live queries.
   */
  namespaceItemAdded: function(namespace, name, item) {
  },

  /**
   * Something we already knew about has changed.  This may affect its
   *  eligibility for live query sets and should notify all queries it already
   *  is known to/being watched on.
   */
  namespaceItemModified: function(namespace, name, item,
                                  changedAttr, newVal, oldVal) {
  },
  /**
   * Something known to us has been deleted from the system or otherwise should
   *  now be treated as completely unknown to us.
   */
  namespaceItemDeleted: function(namespace, name, item) {
  },

  registerNamespaceQuery: function(namespace, name, query) {
  },
  discardNamespaceQuery: function(namespace, name) {
  },

  //////////////////////////////////////////////////////////////////////////////
};

const NS_PEEPS = 'peeps';

/**
 * An optimization we are capable of performing is that we do not have to store
 *  things in a particularly encrypted form.  This allows us to potentially
 *  save a lot of CPU/power.
 *
 * XXX the below is speculative; we are using our DB abstraction for now and
 *  will ideally implement one that provides the below characteristics.  We
 *  are also writing things without thinking out the SSD ramifications too much
 *  because we are under time pressure.
 *
 * Local storage implementation assuming a SQLite-based backend with a slight
 *  bias towards SSD storage.  More specifically, we are going to try and avoid
 *  triggering behaviours that result in a large number of random writes (since
 *  SSDs are good at random reads and linear writes).  This means trying to
 *  minimize the number of b-tree pages that are touched.
 *
 * Our implementation is problem domain aware.
 */
function LocalStore(dbConn, keyring, _logger) {
  this._log = LOGFAB.localStore(this, _logger, null);

  this._db = dbConn;
  this._keyring = keyring;
  this._notif = new NotificationKing(this);

  /**
   * The set of root keys of pinned peeps.
   */
  this._pinnedPeepRootKeys = null;

  this._db.defineHbaseTable(TBL_PEEP_DATA, ["d"]);
  this._db.defineReorderableIndex(TBL_PEEP_DATA,
                                  IDX_PEEP_WRITE_INVOLVEMENT);
  this._db.defineReorderableIndex(TBL_PEEP_DATA,
                                  IDX_PEEP_RECIP_INVOLVEMENT);
  this._db.defineReorderableIndex(TBL_PEEP_DATA,
                                  IDX_PEEP_ANY_INVOLVEMENT);

  // conversation data proper: just data for now, (Was: meta, overview, data)
  this._db.defineHbaseTable(TBL_CONV_DATA, ["d"]);

  this._db.defineReorderableIndex(TBL_CONV_DATA, IDX_ALL_CONVS);

  this._db.defineReorderableIndex(TBL_CONV_DATA,
                                  IDX_CONV_PEEP_WRITE_INVOLVEMENT);
  this._db.defineReorderableIndex(TBL_CONV_DATA,
                                  IDX_CONV_PEEP_RECIP_INVOLVEMENT);
  this._db.defineReorderableIndex(TBL_CONV_DATA,
                                  IDX_CONV_PEEP_ANY_INVOLVEMENT);

  this._bootstrap();
}
exports.LocalStore = LocalStore;
LocalStore.prototype = {
  //////////////////////////////////////////////////////////////////////////////
  // Bootstrap
  _bootstrap: function() {
    // - load our list of pinned peeps by root key
    // XXX actually load
  },

  //////////////////////////////////////////////////////////////////////////////
  // Replica API

  generateReplicaCryptoBlock: function(command, id, payload) {
    var block = {
      cmd: command,
      id: id,
      when: Date.now(),
      data: payload
    };
    var blockStr = JSON.stringify(block);
    var nonce = $keyops.makeSecretBoxNonce();
    var sboxed = this._keyring.secretBoxUtf8With(
                   blockStr, nonce, 'replicaSbox');
    return {nonce: nonce, sboxed: sboxed};
  },

  generateReplicaAuthBlock: function(command, id, payload) {
    var block = {
      cmd: command,
      id: id,
      when: Date.now(),
      data: payload
    };
    var blockStr = JSON.stringify(block);
    var authed = this._keyring.authUtf8With(blockStr, 'replicaAuth');
    return {block: blockStr, auth: authed};
  },

  /**
   * Consume and process one of the many varieties of replica blocks:
   * - crypted block issued by a client (trustworthy)
   * - authenticated block issued by a client (trustworthy)
   * - conversation data from the mailstore (needs validation of nougat)
   * - connect/contact request
   */
  consumeReplicaBlock: function(serialized) {
    // (we used to JSON.stringify, now we don't)
    var mform = serialized,
        authed, block;
    if (mform.hasOwnProperty("fanmsg")) {
      return this._proc_fanmsg(mform);
    }
    // explicitly typed, currently implies contact request
    else if(mform.hasOwnProperty("type")) {
      return this._proc_reqmsg(mform);
    }
    else {
      if (mform.hasOwnProperty("nonce")) {
        block = JSON.parse(this._keyring.openSecretBoxUtf8With(
                    mform.sboxed, mform.nonce, 'replicaSbox'));
      }
      else {
        this._keyring.verifyAuthUtf8With(mform.auth, mform.block,
                                         'replicaAuth');
        block = JSON.parse(mform.block);
      }
      return this._performReplicaCommand(block.cmd, block.id, block.data);
    }
  },

  /**
   * Perform a replica command.
   *
   * Note that we do not differentiate between whether the command came to us
   *  via a secret-boxed or authenticated block.
   */
  _performReplicaCommand: function(command, id, payload) {
    var implCmdName = "_cmd_" + command;
    if (!(implCmdName in this)) {
      throw new Error("no command for '" + block.cmd + "'");
    }
    return this._log.replicaCmd(command, this,
                                 this[implCmdName],
                                 id, payload);
  },

  generateAndPerformReplicaCryptoBlock: function(command, id, payload) {
    var serialized = this.generateReplicaCryptoBlock(command, id, payload);
    this._performReplicaCommand(command, id, payload);
    return serialized;
  },

  generateAndPerformReplicaAuthBlock: function(command, id, payload) {
    var serialized = this.generateReplicaAuthBlock(command, id, payload);
    this._performReplicaCommand(command, id, payload);
    return serialized;
  },

  //////////////////////////////////////////////////////////////////////////////
  // Notifications

  _notifyNewMessagesInConversation: function(convId, msgDataItems) {

  },

  //////////////////////////////////////////////////////////////////////////////
  // Conversation Lookup

  loadAndWatchConversationBlurb: function(convId) {
  },

  unwatchConversationBlurb: function(convId) {
  },

  loadAndWatchConversationInFull: function(convId) {
  },

  unwatchConversationInFull: function(convId) {
  },

  /**
   * Get the list of conversations a user is involved with.
   *
   * @args[
   *   @param[peep]
   *   @param[filter @oneof[null 'pinned']]
   * ]
   */
  queryAndWatchPeepConversationBlurbs: function(peep, filter) {
  },

  /**
   * Request notifications whenever new/unseen messages are added.  This results
   *  in us providing the specific message record plus the conversation blurb.
   */
  subscribeToNewUnseenMessages: function() {
  },


  //////////////////////////////////////////////////////////////////////////////
  // Index Updating
  //
  // We potentially maintain a lot of indices, and the code gets very dry,
  //  so we centralize it.

  /**
   * Update conversation indices, both global and per-peep; this covers
   *  write/recip/any and pinned permutations.  (Note that we don't
   *  have per-peep pinned indices because the presumption is that filtering
   *  will be cheap enough in that case.)
   */
  _updateConvIndices: function(convId, convPinned, authorRootKey, recipRootKeys,
                               timestamp) {
    var promises = [],
        authorIsOurUser = (authorRootKey === this._keyring.rootPublicKey);
    // - global conversation list
    promises.push(this._db.updateIndexValue(
      TBL_CONV_DATA, IDX_ALL_CONVS, '', convId, timestamp));
    // - global pinned conversation list
    if (convPinned)
      promises.push(this._db.updateIndexValue(
        TBL_CONV_DATA, IDX_ALL_CONVS, PINNED, convId, timestamp));

    // - per-peep write/any involvement for the author
    promises.push(this._db.updateIndexValue(
      TBL_CONV_DATA, IDX_CONV_PEEP_WRITE_INVOLVEMENT, authorRootKey,
      convId, timestamp));
    promises.push(this._db.updateIndexValue(
      TBL_CONV_DATA, IDX_CONV_PEEP_ANY_INVOLVEMENT, authorRootKey,
      convId, timestamp));
    // - per-peep (maybe recip)/any involvement for the recipients
    for (var iRecip = 0; iRecip < recipRootKeys.length; iRecip++) {
      var rootKey = recipRootKeys[iRecip];
      // - boost any involvement
      promises.push(this._db.updateIndexValue(
        TBL_CONV_DATA, IDX_CONV_PEEP_ANY_INVOLVEMENT,
        rootKey, convId, timestamp));
      // - boost recip involvement
      if (authorIsOurUser)
        promises.push(this._db.updateIndexValue(
          TBL_CONV_DATA, IDX_CONV_PEEP_RECIP_INVOLVEMENT,
          rootKey, convId, timestamp));

    }

    return $Q.all(promises);
  },

  /**
   * Update the peep indices; this covers write/recip/any and pinned
   *  permutations.  The caller does not need to worry about knowing whether
   *  people are pinned; we keep that information around and cached.
   */
  _updatePeepIndices: function(authorRootKey, recipRootKeys, timestamp) {
    var promises = [];
    // write/any involvement for the author
    // (maybe) pinned variants
    // (maybe recip)/any involvement for the recipients
    // (maybe) pinned variants

    return $Q.all(promises);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Contact Request Processing

  _proc_reqmsg: function(reqmsg) {
    // XXX store, do display stuff, etc.
    this._log.contactRequest(reqmsg.senderKey);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Conversation Processing

  _proc_fanmsg: function(fanmsg) {
    // -- invite?
    // (This gets to be the root of the conversation on the mailstore; it comes
    //  from the welcome message, which, for consistency reasons, the mailstore
    //  breaks apart and pretends does not exist to us.)
    if (fanmsg.hasOwnProperty("sentBy")) {
      return this._procConvInvite(fanmsg);
    }
    // -- fanout message
    else {
      // - decrypt fanout envelope (transit server to our envelope key)
      var fanoutEnv = JSON.parse(
        this._keyring.openBoxUtf8With(fanmsg.fanmsg, fanmsg.nonce,
                                      fanmsg.transit,
                                      'messaging', 'envelopeBox'));

      var self = this;
      // just grab all the cells; XXX timecopout caching/unification
      return when(this._db.getRow(TBL_CONV_DATA, fanmsg.convId, "d"),
                  function(cells) {
        if (!cells.hasOwnProperty("d:meta"))
          throw new $taskerrors.MissingPrereqFatalError();
        var convMeta = cells["d:meta"];

        var procfunc;
        switch(fanoutEnv.type) {
          case 'join':
            procfunc = self._procConvJoin;
            break;
          case 'message':
            procfunc = self._procConvMessage;
            break;
          case 'meta':
            procfunc = self._procConvMetaMsg;
            break;
          default:
            throw new $taskerrors.MalformedPayloadError(
                        'bad type: ' + fanoutEnv.type);
        }

        return self._log.procConv(fanoutEnv.type,
                                   self, procfunc,
                                   convMeta, fanoutEnv, cells);
      });
    }
  },

  _cmd_convCreate: function() {

  },

  /**
   * Process a conversation invitation by validating its attestation and
   *  creating the appropriate database row.  The conversation will not become
   *  visible to the user until at least one message has been processed.
   */
  _procConvInvite: function(fanmsg) {
    // - unbox the invite envelope
    var inviteEnv = JSON.parse(
                      this._keyring.openBoxUtf8With(
                        fanmsg.fanmsg, fanmsg.nonce, fanmsg.sentBy,
                        'messaging', 'envelopeBox'));

    // - unbox the invite payload
    var inviteBody = JSON.parse(
                       this._keyring.openBoxUtf8With(
                         inviteEnv.payload, fanmsg.nonce, fanmsg.sentBy,
                         'messaging', 'bodyBox'));

    // - validate the attestation (and enclosed creator self-ident)
    var attestPayload = $msg_gen.assertGetConversationAttestation(
                          inviteBody.signedAttestation, inviteEnv.convId);
    var creatorPubring =
      $pubring.createPersonPubringFromSelfIdentDO_NOT_VERIFY(
        attestPayload.creatorSelfIdent);

    // - reconstruct the overview convMeta
    var convMeta = {
      id: inviteEnv.convId,
      transitServerKey: inviteEnv.transitServerKey,
      envelopeSharedSecretKey: inviteEnv.envelopeSharedSecretKey,
      bodySharedSecretKey: inviteBody.bodySharedSecretKey,
      signedAttestation: inviteBody.signedAttestation,
    };

    // - persist, mark the creator as the first authorized participant
    // (they will still be "joined" which will replace the entry)
    var cells = {
      "d:meta": convMeta,
      "d:m": 0,
    };
    cells["d:s" + creatorPubring.getPublicKeyFor('messaging', 'tellBox')] =
      attestPayload.creatorSelfIdent;
    var self = this;
    return when(this._db.putCells(TBL_CONV_DATA, convMeta.id, cells),
                function() {
                  self._log.newConversation(convMeta.id);
                });
  },

  /**
   * Process a join message.
   */
  _procConvJoin: function(convMeta, fanoutEnv, cells) {
    // - get the pubring for the inviter, exploding if they are not authorized
    var inviterCellName = "d:s" + fanoutEnv.sentBy;
    if (!cells.hasOwnProperty(inviterCellName))
      throw new $taskerror.UnauthorizedUserDataLeakError(  // a stretch...
                  "uncool inviter: " + fanoutEnv.sentBy);
    var inviterPubring =
      $pubring.createPersonPubringFromSelfIdentDO_NOT_VERIFY(
        cells[inviterCellName]); // (this is a blob-string, not json encoded)

    // - unsbox the attestation
    var signedAttestation = $keyops.secretBoxOpen(fanoutEnv.payload,
                                                  fanoutEnv.nonce,
                                                  convMeta.bodySharedSecretKey);
    // - validate the attestation
    var oident = $msg_gen.assertCheckConversationInviteAttestation(
                   signedAttestation, inviterPubring, convMeta.id,
                   fanoutEnv.receivedAt);

    this._nameTrack(oident, inviterPubring);

    var inviteePubring =
      $pubring.createPersonPubringFromSelfIdentDO_NOT_VERIFY(
        oident.personSelfIdent);

    var inviteeRootKey = inviteePubring.rootPublicKey;

    var writeCells = {};
    // - add the invitee as an authorized participant by their tell key
    writeCells["d:s" + fanoutEnv.invitee] = oident.personSelfIdent;
    // - add the join entry in the message sequence
    var msgNum = writeCells["d:m"] = parseInt(cells["d:m"]) + 1;
    writeCells["d:m" + msgNum] = {type: 'join', id: inviteeRootKey};

    // XXX update in-memory reps
    var timestamp = fanoutEnv.receivedAt;

    var self = this;
    return $Q.join(
      this._db.putCells(TBL_CONV_DATA, convMeta.id, writeCells),
      // - create peep conversation involvement index entry
      this._db.updateIndexValue(
        TBL_CONV_DATA, IDX_CONV_PEEP_ANY_INVOLVEMENT, inviteeRootKey,
        convMeta.id, timestamp),
      // - touch peep activity entry
      this._db.maximizeIndexValue(
        TBL_PEEP_DATA, IDX_PEEP_ANY_INVOLVEMENT, '', inviteeRootKey, timestamp),
      // - boost their involved conversation count
      this._db.incrementCell(TBL_PEEP_DATA, inviteeRootKey, 'd:nconvs', 1),
      function() {
        self._log.conversationMessage(convMeta.id, fanoutEnv.nonce);
      }
    );
  },

  /**
   * Meta-data about a conversation from other participants.
   */
  _procConvMetaMsg: function(convMeta, fanoutEnv, cells) {
    // -- update anyone subscribed to the full conversation


    // --- metadata message
    // -- write
    // -- posit latched notification for active subscribers
    // -- nuke pending new message notification if our user saw something...
  },

  /**
   * Add a message (human or machine) to a conversation.
   *
   * If this is a join notification, we will name-check the added person.
   */
  _procConvMessage: function(convMeta, fanoutEnv, cells) {
    var authorTellKey = fanoutEnv.sentBy;
    var authorCellName = "d:s" + authorTellKey;
    if (!cells.hasOwnProperty(authorCellName))
      throw new $taskerror.UnauthorizedUserDataLeakError();
    var authorPubring =
      $pubring.createPersonPubringFromSelfIdentDO_NOT_VERIFY(
        cells[authorCellName]);
    var authorRootKey = authorPubring.rootPublicKey;

    var authorIsOurUser = (authorRootKey === this._keyring.rootPublicKey);

    // - decrypt conversation envelope
    var convEnv = $msg_gen.assertGetConversationHumanMessageEnvelope(
                    fanoutEnv.payload, fanoutEnv.nonce, convMeta);

    // - decrypt conversation body
    var convBody = $msg_gen.assertGetConversationHumanMessageBody(
                     convEnv.body, fanoutEnv.nonce, convMeta,
                     fanoutEnv.receivedAt, authorPubring);


    // - persist the message
    var writeCells = {};
    var msgNum = writeCells["d:m"] = parseInt(cells["d:m"]) + 1;
    var msgRec = {
      type: 'message',
      authorId: authorRootKey,
      composedAt: convBody.composedAt,
      text: convBody.body
    };
    writeCells["d:m" + msgNum] = msgRec;

    // - message notification
    this._notif.trackNewishMessage(convMeta.id, msgNum, msgRec);

    var timestamp = fanoutEnv.receivedAt;

    var promises = [
      this._db.putCells(TBL_CONV_DATA, convMeta.id, writeCells),
      // -- conversation indices
      // - all conversation index
      // - per-peep conversation indices
    ];

    // - all recipients stuff
    var recipRootKeys = [];
    for (var key in cells) {
      if (!/^d:s/.test(key) || key === authorCellName)
        continue;
      // this must be the cell for one of the other recipients
      var recipPubring =
        $pubring.createPersonPubringFromSelfIdentDO_NOT_VERIFY(cells[key]);
      recipRootKeys.push(recipPubring.rootPublicKey);
    }

    this._updateConvIndices(convMeta.id, /* pinned */ false,
                            authorRootKey, recipRootKeys, timestamp);

    // - author is not us
    if (!authorIsOurUser) {
      // - peep indices
      promises.push(this._db.maximizeIndexValue(
        TBL_PEEP_DATA, IDX_PEEP_WRITE_INVOLVEMENT, '',
        authorRootKey, timestamp));
      // - boost unread message count
      promises.push(this._db.incrementCell(
        TBL_PEEP_DATA, authorRootKey, 'd:nunread', authorIsOurUser ? 0 : 1));
    }

    // XXX notifications
    var self = this;
    return $Q.join(
      function() {
        self._log.conversationMessage(convMeta.id, fanoutEnv.nonce);
      }
    );
  },

  /**
   * Our own meta-data about a conversation (pinned, etc.)
   */
  _cmd_setConvMeta: function() {
    // -- update any subscribed queries on pinned
    // -- update any blurbs for this conversation
  },

  /**
   * Our user has composed a message to a conversation; track it for UI display
   *  but be ready to nuke it when the actual message successfully hits the
   *  conversation.
   */
  /*
  _cmd_outghostAddConversationMessage: function() {
  },
  */

  //////////////////////////////////////////////////////////////////////////////
  // Peep Lookup

  /**
   * Issue a live query on a (sub)set of peeps.  We care about changes to the
   *  peeps in the set after we return it, plus changes to the membership of
   *  the set.
   *
   * @args[
   *   @param[by @oneof['recency' 'alphabet']]
   *   @param[filter @oneof[null 'pinned']]
   * ]
   */
  queryAndWatchPeepBlurbs: function(by, filter) {
    var idx;
    switch (by) {
      case 'recency':
        idx = IDX_PEEP_ANY_INVOLVEMENT;
        break;
      default:
        throw new Error("Unsupported ordering: " + by);
    }
    return when(this._db.scanIndex(TBL_PEEP_DATA, idx, '',
                                   null, null, null, null, null, null),
      function(rootKeys) {
        var promises = [];
        for (var iKey = 0; iKey < rootKeys.length; iKey++) {
          var rootKey = rootKeys[iKey];
          promises.push();
        }
      }
      // rejection pass-through is desired
      );
  },

  loadAndWatchPeepBlurb: function(rootKey) {
  },

  unwatchPeepBlurb: function() {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Peep Mutation
  //
  // "My peeps"; people I have an explicit relationship with and who are allowed
  //  to send me messages

  /**
   * Add a contact to our address book.
   *
   * @designCall[clarkbw]{
   *   Adding a contact acts like the user you sent you a message at that
   *   instant.  We may eventually add fake messages 'like "Andrew and you
   *   are connected.  Here's everything you know about him now..."'.
   * }
   */
  _cmd_addContact: function(peepRootKey, oident) {
    var now = Date.now();

    // -- persist
    this._db.putCells(TBL_PEEP_DATA, peepRootKey, {
      'd:oident': oident,
      'd:meta': {},
      'd:nunread': 0,
      'd:nconvs': 0,
    });
    // -- bump indices
    this._db.updateIndexValue(TBL_PEEP_DATA, IDX_PEEP_ANY_INVOLVEMENT,
                              peepRootKey, now);
    this._db.updateIndexValue(TBL_PEEP_DATA, IDX_PEEP_WRITE_INVOLVEMENT,
                              peepRootKey, now);

    // -- notify peep queries
    this._notif.namespaceItemAdded(NS_PEEPS, peepRootKey,
                                   {oident: oident});
  },

  /**
   * Set some meta-data about a contact in our address book (pinned, etc.)
   */
  _cmd_metaContact: function(peepRootKey, meta) {
    this._db.putCells(TBL_PEEP_DATA, peepRootKey, {
      'd:meta': meta,
    });
    // -- persist
    // -- notify affected queries
    // -- notify subscribed blurbs
  },

  /**
   * Set some contact-provided meta-data about a contact in our address book.
   */
  /*
  _cmd_setContactPeepMeta: function() {
  },
  */

  /*
  _cmd_delContact: function() {
  },
  */


  //////////////////////////////////////////////////////////////////////////////
  // Peeps

  //////////////////////////////////////////////////////////////////////////////
  // Contact/Peep overlap

  /**
   * A person was added in a conversation; if the person is not a contact
   *  but rather a peep, boost the reference count and make note of their
   *  relationship.
   *
   * XXX this is speculative work that needs to be filled out
   */
  _nameTrack: function(oidentPayload, inviterPubring) {
  },

  /**
   * A previously namechecked name is no longer relevant because the
   *  conversation is being expired, etc.
   */
  _nameGone: function() {
  },


  //////////////////////////////////////////////////////////////////////////////
};

var LOGFAB = exports.LOGFAB = $log.register($module, {
  localStore: {
    //implClass: AuthClientConn,
    type: $log.DAEMON,
    subtype: $log.DAEMON,
    events: {
      contactRequest: {requester: 'key'},

      newConversation: {convId: true},
      conversationMessage: {convId: true, nonce: true},
    },
    calls: {
      replicaCmd: {command: true},
      procConv: {type: true},
    },
    TEST_ONLY_calls: {
      replicaCmd: {id: true},
      procConv: {convMeta: false, fanoutEnv: false, cells: false},
    },
  },
});
}); // end define
