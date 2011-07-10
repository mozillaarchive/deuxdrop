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
    'rdcommon/identities/pubident',
    'rdcommon/messages/generator',
    'module',
    'exports'
  ],
  function(
    $Q,
    $log,
    $task, $taskerrors,
    $keyops, $pubring,
    $pubident,
    $msg_gen,
    $module,
    exports
  ) {
var when = $Q.when;

/**
 * Data on peeps, be they a contact or a transitive-acquaintance we heard of
 *  through a conversation.
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
 * - d:meta - The conversation meta-info for this conversation.
 * - d:s### - Self-ident for the given authorized participant by their tell
 *             key.  The payload may want to be normalized out and the name
 *             may want to become their root key.
 * - d:m - High message number
 * - d:m# - Message number #.  Fully decrypted rep.
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

  namespaceItemAdded: function(namespace, name, item) {
  },

  namespaceItemModified: function(namespace, name, item) {
  },
  namespaceItemDeleted: function(namespace, name, item) {
  },

  registerNamespaceQuery: function(namespace, name, query) {
  },
  discardNamespaceQuery: function(namespace, name) {
  },


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
                                  IDX_CONV_PEEP_ANY_INVOLVEMENT);
}
exports.LocalStore = LocalStore;
LocalStore.prototype = {
  //////////////////////////////////////////////////////////////////////////////
  // Replica API

  _generateReplicaCryptoBlock: function(command, payload) {
    var block = {
      cmd: command,
      when: Date.now(),
      data: payload
    };
    var blockStr = JSON.stringify(block);
    var nonce = $keyops.makeSecretBoxNonce();
    var sboxed = this._keyring.secretBoxUtf8With(
                   blockStr, nonce, 'replicaSbox');
    // while we could also concatenate, in theory we would eventually cram
    //  some minor metadata in here, like an indicator of what key we are using
    //  or the like.  some of that could be overloaded into the nonce.
    return JSON.stringify({nonce: nonce, sboxed: sboxed});
  },

  _generateReplicaAuthBlock: function(command, payload) {
    var block = {
      cmd: command,
      when: Date.now(),
      data: payload
    };
    var blockStr = JSON.stringify(block);
    var authed = this._keyring.authUtf8With(blockStr, 'replicaAuth');
    // while we could also concatenate, in theory we would eventually cram
    //  some minor metadata in here, like an indicator of what key we are using
    //  or the like.  some of that could be overloaded into the nonce.
    return JSON.stringify({block: blockStr, auth: authed});
  },

  /**
   * Consume and process one of the many varieties of replica blocks:
   * - crypted block issued by a client (trustworthy)
   * - authenticated block issued by a client (trustworthy)
   * - conversation data from the mailstore (needs validation of nougat)
   */
  consumeReplicaBlock: function(serialized) {
    // XXX temporarily add slack in whether we marshal it on the way down
    var mform = (typeof(serialized) === "string") ? JSON.parse(serialized)
                                                  : serialized,
        authed, block;
    if (mform.hasOwnProperty("fanmsg")) {
      return this._proc_fanmsg(mform);
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
      return this._performReplicaCommand(block.cmd, block.data);
    }
  },

  /**
   * Perform a replica command.
   *
   * Note that we do not differentiate between whether the command came to us
   *  via a secret-boxed or authenticated block.
   */
  _performReplicaCommand: function(command, payload) {
    var implCmdName = "_cmd_" + command;
    if (!(implCmdName in this)) {
      throw new Error("no command for '" + block.cmd + "'");
    }
    return this[implCmdName](payload);
  },

  generateAndPerformReplicaCryptoBlock: function(command, payload) {
    var serialized = this._generateReplicaCryptoBlock(command, payload);
    this._performReplicaCommand(command, payload);
    return serialized;
  },

  generateAndPerformReplicaAuthBlock: function(command, payload) {
    var serialized = this._generateReplicaAuthBlock(command, payload);
    this._performReplicaCommand(command, payload);
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
  // Conversation Processing

  _proc_fanmsg: function(fanmsg) {
    // -- invite?
    // (This gets to be the root of the conversation on the mailstore; it comes
    //  from the welcome message, which, for consistency reasons, the mailstore
    //  breaks apart and pretends does not exist to us.)
    if (fanmsg.hasOwnProperty("sentBy")) {
      return this._proc_convInvite(fanmsg);
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
        var convMeta = JSON.parse(cells["d:meta"]);

        var procfunc;
        switch(fanoutEnv.type) {
          case 'join':
            procfunc = self._proc_convJoin;
            break;
          case 'message':
            procfunc = self._proc_convMessage;
            break;
          case 'meta':
            procfunc = self._proc_convMetaMsg;
            break;
          default:
            throw new $taskerrors.MalformedPayloadError(
                        'bad type: ' + fanoutEnv.type);
        }

        return self._log.proc_conv(fanoutEnv.type,
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
  _proc_convInvite: function(fanmsg) {
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
      "d:meta": JSON.stringify(convMeta),
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
  _proc_convJoin: function(convMeta, fanoutEnv, cells) {
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

    // XXX we really want to be using the root key, I suspect
    var inviteePeepId = fanoutEnv.invitee;

    var writeCells = {};
    // - add the invitee as an authorized participant
    writeCells["d:s" + fanoutEnv.invitee] = oident.personSelfIdent;
    // - add the join entry in the message sequence
    var msgNum = writeCells["d:m"] = parseInt(cells["d:m"]) + 1;
    writeCells["d:m" + msgNum] =
      JSON.stringify({type: 'join', id: inviteePeepId});

    // XXX update in-memory reps
    var timestamp = fanoutEnv.receivedAt;

    return $Q.wait(
      this._db.putCells(TBL_CONV_DATA, convMeta.id, writeCells),
      // - create peep conversation involvement index entry
      this._db.updateIndexValue(
        TBL_CONV_DATA, IDX_CONV_PEEP_ANY_INVOLVEMENT, inviteePeepId,
        convMeta.id, timestamp),
      // - touch peep activity entry
      this._db.maximizeIndexValue(
        TBL_PEEP_DATA, IDX_PEEP_ANY_INVOLVEMENT, '', inviteePeepId, timestamp)
    );
  },

  /**
   * Meta-data about a conversation from other participants.
   */
  _proc_convMetaMsg: function(convMeta, fanoutEnv, cells) {
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
  _proc_convMessage: function(convMeta, fanoutEnv, cells) {
    var authorPeepId = fanoutEnv.sentBy;
    var authorCellName = "d:s" + authorPeepId;
    if (!cells.hasOwnProperty(authorCellName))
      throw new $taskerror.UnauthorizedUserDataLeakError();
    var authorPubring =
      $pubring.createPersonPubringFromSelfIdentDO_NOT_VERIFY(
        cells[authorCellName]);

    // - decrypt conversation envelope
    var convEnv = $msg_gen.assertGetConversationHumanMessageEnvelope(
                    fanoutEnv.payload, fanoutEnv.nonce, convMeta);

    // - decrypt conversation body
    var convBody = $msg_gen.assertGetConversationHumanMessageBody(
                     convEnv.body, fanoutEnv.nonce, convMeta,
                     fanoutEnv.receivedAt, authorPubring);



    // - add the join entry in the message sequence
    var writeCells = {};
    var msgNum = writeCells["d:m"] = parseInt(cells["d:m"]) + 1;
    writeCells["d:m" + msgNum] = JSON.stringify({
      type: 'message',
      authorId: authorPeepId,
      composedAt: convBody.composedAt,
      text: convBody.body
    });

    var timestamp = fanoutEnv.receivedAt;

    // XXX notifications
    var self = this;
    return $Q.join(
      this._db.putCells(TBL_CONV_DATA, convMeta.id, writeCells),
      // - all conversation index
      this._db.updateIndexValue(
        TBL_CONV_DATA, IDX_ALL_CONVS, '', convMeta.id, timestamp),
      // - per-peep conversation indices
      this._db.updateIndexValue(
        TBL_CONV_DATA, IDX_CONV_PEEP_WRITE_INVOLVEMENT, authorPeepId,
        convMeta.id, timestamp),
      // (XXX recip involvement if our own user wrote this)
      this._db.updateIndexValue(
        TBL_CONV_DATA, IDX_CONV_PEEP_ANY_INVOLVEMENT, authorPeepId,
        convMeta.id, timestamp),
      // - touch peep (activity) indices
      this._db.maximizeIndexValue(
        TBL_PEEP_DATA, IDX_PEEP_WRITE_INVOLVEMENT, '', authorPeepId,
        timestamp),
      this._db.maximizeIndexValue(
        TBL_PEEP_DATA, IDX_PEEP_ANY_INVOLVEMENT, '', authorPeepId, timestamp),
      function() {
        self._log.conversationMessage(convMeta.id, fanoutEnv.nonce);
      }
    );
  },

  /**
   * Our own meta-data about a conversation (pinned, etc.)
   */
  /*
  _cmd_setConversationMeta: function() {
    // -- update any subscribed queries on pinned
    // -- update any blurbs for this conversation
  },
  */

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
   * @args[
   *   @param[by @oneof['recency' 'alphabet']]
   *   @param[filter @oneof[null 'pinned']]
   * ]
   */
  queryAndWatchPeepBlurbs: function(by, filter) {

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
  _cmd_addContact: function(data) {
    var now = Date.now();
    var peepRootKey = data.rootKey;

    // -- persist
    this._db.putCells(TBL_PEEP_DATA, peepRootKey, {
      'd:oident': data.oident,
    });
    // -- bump indices
    this._db.updateIndexValue(TBL_PEEP_DATA, IDX_PEEP_ANY_INVOLVEMENT,
                              peepRootKey, now);
    this._db.updateIndexValue(TBL_PEEP_DATA, IDX_PEEP_WRITE_INVOLVEMENT,
                              peepRootKey, now);

    // -- notify peep queries
    this._notif.namespaceItemAdded(NS_PEEPS, peepRootKey,
                                   {oident: data.oident});
  },

  /**
   * Set some meta-data about a contact in our address book (pinned, etc.)
   */
  _cmd_setContactMeta: function() {
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
      newConversation: {convId: true},
      conversationMessage: {convId: true, nonce: true},
    },
    calls: {
      proc_conv: {type: true},
    },
    TEST_ONLY_calls: {
      proc_conv: {convMeta: false, fanoutEnv: false, cells: false},
    },
  },
});
}); // end define
