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
    'rdcommon/taskidiom', 'rdcommon/taskerrors',
    'rdcommon/crypto/keyops', 'rdcommon/crypto/pubring',
    'rdcommon/identities/pubident',
    'rdcommon/messages/generator',
    './schema',
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
    $lss,
    $module,
    exports
  ) {
const when = $Q.when;

var LOGFAB = exports.LOGFAB = $log.register($module, {
});

var taskMaster = $task.makeTaskMasterForModule($module, LOGFAB);

const NS_PEEPS = 'peeps',
      NS_CONVBLURBS = 'convblurbs', NS_CONVMSGS = 'convmsgs',
      NS_SERVERS = 'servers';

/**
 * Process an other-person-ident issued by us or someone else to ensure we have
 *  data on a given peep and that our limited graph structure is up-to-date.
 *  Graph-wise, for people who are not our contacts, we want to be able to
 *  explain how that person is known to us, ideally using the shortest
 *  possible explanation.
 *
 * We are used by conversation-joining logic and contact addition.  The marriage
 *  of these two is a bit ugly, but better than having the logic separate and
 *  likely to break.
 *
 * We handle shortest chain logic in a dynamic programming fashion.  If it's a
 *  contact add, we set the chain to just us.  If it's a name-track by
 *  someone else and this is a new incoming edge (no d:g entry yet), we lookup
 *  the naming user if there is no current chain or it is longer than 2.  Once
 *  we have that user, we then just take their chain and add this new link to
 *  it.
 */
var PeepNameTrackTask = exports.PeepNameTrackTask = taskMaster.defineTask({
  name: 'peepNameTrack',
  args: ['store', 'peepOident', 'othPubring'],
  steps: {
    lookup_peep_data: function() {
      // if this is an addContact operation, we need to open up the other ident.
      // XXX note that we do not support changing the contact name right now,
      //  if we use this path for name changes too, we need to indicate that.
      this.isContactAdd = (typeof(this.peepOident) === 'string');
      // may also become true based on the results of cell lookup.
      this.isContact = this.isContactAdd;
      if (this.isContactAdd) {
        this.signedIdent = this.peepOident;
        // XXX we should be using the timestamp of the replica block
        this.peepOident = $pubident.assertGetOtherPersonIdent(
                            this.signedIdent, this.othPubring, Date.now());
      }
      this.peepPubring = $pubring.createPersonPubringFromSelfIdentDO_NOT_VERIFY(
                           this.peepOident.personSelfIdent);

      return this.store._db.getRow($lss.TBL_PEEP_DATA,
                                   this.peepPubring.rootPublicKey, null);
    },
    got_peep_data: function(cells) {
      this.cells = cells;
      var writeCells, promise;
      // - new peep (to us)
      if (!cells.hasOwnProperty('d:sident')) {
        writeCells = this.writeCells = {
          'd:sident': this.peepOident.personSelfIdent,
          'd:meta': {},
          'd:nunread': 0,
          'd:nconvs': this.isContactAdd ? 0 : 1,
        };
      }
      // - previously known
      else {
        writeCells = this.writeCells = {};
        if (!this.isContactAdd)
          writeCells['d:nconvs'] = (cells['d:nconvs'] || 0) + 1;
        if (cells.hasOwnProperty('d:oident'))
          this.isContact = true;
      }
      // - contact add
      if (this.isContactAdd) {
        writeCells['d:oident'] = this.signedIdent;
        writeCells['d:schain'] = {
          links: [{
            name: this.peepOident.localPoco.displayName,
          }],
        };
      }
      // - graph
      var graphInKey = 'd:gi' + this.othPubring.rootPublicKey;
      if (!cells.hasOwnProperty(graphInKey)) {
        writeCells[graphInKey] = this.peepOident.localPoco;

        var reverseCells = {};
        reverseCells['d:go' + this.peepPubring.rootPublicKey] = 1;
        promise = this.store._db.putCells($lss.TBL_PEEP_DATA,
                                          this.othPubring.rootPublicKey,
                                          reverseCells);
      }

      return promise;
    },
    check_if_chain_lookup_required: function() {
      if (!this.isContactAdd &&
            (!this.cells.hasOwnProperty('d:schain') ||
             this.cells['d:schain'].links.length > 2))
        return this.store._db.getRowCell($lss.TBL_PEEP_DATA,
                                         this.othPubring.rootPublicKey,
                                         'd:schain');
      return null;
    },
    maybe_extend_chain: function(otherChain) {
      if (otherChain) {
        // there is not shared, we can mutate
        otherChain.links.push({name: this.peepOident.localPoco.displayName});
        this.writeCells['d:schain'] = otherChain;
      }
    },
    write_peep_data: function() {
      return this.store._db.putCells($lss.TBL_PEEP_DATA,
                                     this.peepPubring.rootPublicKey,
                                     this.writeCells);
    },
    add_contact_update_indices: function() {
      if (this.isContactAdd) {
        return this.store._db.updateStringIndexValue(
          $lss.TBL_PEEP_DATA, $lss.IDX_PEEP_CONTACT_NAME, '',
          this.peepPubring.rootPublicKey,
          this.peepOident.localPoco.displayName);
      }
      return undefined;
    },
    generate_notifications: function() {
      // We only care about generating the creation notification.
      // The number of conversations and write/recip/any timestamp views are
      //  updated by the tasks that actually process messages for the
      //  conversations.
      if (this.isContactAdd)
        return this.store._notifyNewContact(this.peepPubring.rootPublicKey,
                                            this.cells, this.writeCells,
                                            this.peepOident.localPoco);
      return null;
    },
    all_done: function() {
      return this.peepPubring;
    },
  },
});

/**
 * Process a conversation invitation by validating its attestation and creating
 *  the appropriate database row.  This is mainly a book-keeping exercise, but
 *  is also an important cryptographic check since the client is (usually) the
 *  first layer of the software stack that has the body box key and thus is able
 *  to see the true payload.
 *
 * The conversation will not become visible to the user until the first message
 *  in the conversation is seen.  (The choice of the first message is made so
 *  that we never have a conversation blurb that claims to have zero messages,
 *  which would violate many apparent invariants.)
 */
var ConvInviteTask = exports.ConvInviteTask = taskMaster.defineTask({
  name: 'convInvite',
  args: ['store', 'fanmsg'],
  steps: {
    all: function() {
      var fanmsg = this.fanmsg;
      // - unbox the invite envelope
      var inviteEnv = JSON.parse(
                        this.store._keyring.openBoxUtf8With(
                          fanmsg.fanmsg, fanmsg.nonce, fanmsg.sentBy,
                          'messaging', 'envelopeBox'));

      // - unbox the invite payload
      var inviteBody = JSON.parse(
                         this.store._keyring.openBoxUtf8With(
                           inviteEnv.payload, fanmsg.nonce, fanmsg.sentBy,
                           'messaging', 'bodyBox'));

      // - validate the attestation (and enclosed creator self-ident)
      var attestPayload = $msg_gen.assertGetConversationAttestation(
                            inviteBody.signedAttestation, inviteEnv.convId);
      var creatorPubring =
        $pubring.createPersonPubringFromSelfIdentDO_NOT_VERIFY(
          attestPayload.creatorSelfIdent);

      // - reconstruct the overview convMeta
      // ugly: we are saving convMeta off for a unit test to extract from our
      //  dessicated corpse.
      var convMeta = this.convMeta = {
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
      cells["d:p" + creatorPubring.getPublicKeyFor('messaging', 'tellBox')] =
        creatorPubring.rootPublicKey;
      var self = this;
      return when(this.store._db.putCells($lss.TBL_CONV_DATA, convMeta.id,
                                          cells),
                  function() {
                    self.store._log.newConversation(convMeta.id);
                  });
    },
  },
});

/**
 * Process a join message, the notification from the fanout server that someone
 *  has joined the conversation.  (Which means they have now seen the backlog,
 *  will see all new messages, and can post messages to the conversation.)
 */
var ConvJoinTask = exports.ConvJoinTask = taskMaster.defineTask({
  name: 'convJoin',
  args: ['store', 'convMeta', 'fanoutEnv', 'cells'],
  steps: {
    validate_invite_attestation: function() {
      var fanoutEnv = this.fanoutEnv;
      // - get the pubring for the inviter, exploding if they are not authorized
      var inviterCellName = "d:p" + fanoutEnv.sentBy;
      if (!this.cells.hasOwnProperty(inviterCellName))
        throw new $taskerror.UnauthorizedUserDataLeakError(  // a stretch...
                    "uncool inviter: " + fanoutEnv.sentBy);

      var inviterRootKey = this.cells[inviterCellName];

      // we may be the inviter; avoid hitting disk in that case.
      if (inviterRootKey === this.store._pubring.rootPublicKey)
        return this.store._pubring;

      // PeepNameTrackTask may retrieve data from this row too, it might make
      //  sense to rejigger out interaction with it so we only issue one read.
      return this.store._db.getRowCell($lss.TBL_PEEP_DATA,
                                       inviterRootKey,
                                       'd:sident');
    },
    got_inviter_selfident: function(inviterSelfIdent) {
      var inviterPubring = this.inviterPubring =
        // we may have fastpathed if we are the inviter...
        (inviterSelfIdent instanceof $pubring.PersonPubring) ?
        inviterSelfIdent :
        $pubring.createPersonPubringFromSelfIdentDO_NOT_VERIFY(
          inviterSelfIdent);

      // - unsbox the attestation
      var signedAttestation = $keyops.secretBoxOpen(
                                this.fanoutEnv.payload, this.fanoutEnv.nonce,
                                this.convMeta.bodySharedSecretKey);
      // - validate the attestation
      var oident = $msg_gen.assertCheckConversationInviteAttestation(
                     signedAttestation, inviterPubring, this.convMeta.id,
                     this.fanoutEnv.receivedAt);

      return new PeepNameTrackTask(
        { store: this.store, peepOident: oident, othPubring: inviterPubring },
        this.log);
    },
    // PeepNameTrackTask returns the pubring from the oident to be nice.
    update_conv_data: function(inviteePubring) {
      var inviterRootKey = this.inviterPubring.rootPublicKey;
      var inviteeRootKey = this.inviteeRootKey =
        inviteePubring.rootPublicKey;
      var timestamp = this.fanoutEnv.receivedAt;

      var writeCells = this.writeCells = {};
      // - add the invitee as an authorized participant by their tell key
      writeCells["d:p" + this.fanoutEnv.invitee] = inviteeRootKey;
      // - add the join entry in the message sequence
      var msgNum = this.msgNum = writeCells["d:m"] =
        parseInt(this.cells["d:m"]) + 1;
      var msgRec = this.msgRec = writeCells["d:m" + msgNum] = {
        type: 'join',
        by: inviterRootKey,
        id: inviteeRootKey,
        receivedAt: timestamp,
      };


      // (we are not traversing writeCells, so we need to put the invitee in)
      var recipRootKeys = this.recipRootKeys = [inviteeRootKey],
          inviterCellName = "d:p" + this.fanoutEnv.sentBy, cells = this.cells;
      for (var key in cells) {
        if (!/^d:p/.test(key) || key === inviterCellName)
          continue;
        // this must be the cell for one of the other recipients
        recipRootKeys.push(cells[key]);
      }

      var convIndexUpdates = this.convIndexUpdates = [],
          peepIndexMaxes = this.peepIndexMaxes = [];
      const convPinned = false;
      this.store._makeConvIndexUpdates(
        this.convMeta.id, convPinned, convIndexUpdates, peepIndexMaxes,
        inviterRootKey, recipRootKeys, timestamp);


      var self = this;
      return $Q.wait(
        this.store._db.putCells($lss.TBL_CONV_DATA, this.convMeta.id,
                                writeCells),
        this.store._db.updateMultipleIndexValues(
          $lss.TBL_CONV_DATA, convIndexUpdates),
        this.store._db.maximizeMultipleIndexValues(
          $lss.TBL_PEEP_DATA, peepIndexMaxes)
      );
    },
    // this has to happen after we perform the db maxification
    generate_notifications: function() {
      // - peep notifications
      this.store._notifyPeepConvDeltas(
        this.inviterPubring.rootPublicKey, null,
        this.recipRootKeys,
        this.peepIndexMaxes,
        this.inviteeRootKey, { numConvs: 1 });

      // - conversation blurb notification
      if (this.msgNum === 1)
        this.store._notifyNewConversation(
          this.convMeta.id, this.cells, this.writeCells,
          this.convIndexUpdates);
      else
        this.store._notifyModifiedConversation(
          this.convMeta.id, this.cells, this.writeCells,
          this.convIndexUpdates);

      // - "new" notifications, conv messages notifications
      this.store._notif.trackNewishMessage(this.convMeta.id, this.msgNum,
                                           this.msgRec,
                                           this.cells, this.writeCells);
      this.store._log.conversationMessage(this.convMeta.id,
                                          this.fanoutEnv.nonce);
    },
  },
});

/**
 * Add a human message to a conversation.
 */
var ConvMessageTask = exports.ConvMessageTask = taskMaster.defineTask({
  name: 'convMessage',
  args: ['store', 'convMeta', 'fanoutEnv', 'cells'],
  steps: {
    // lookup the author so we can get their pubring for consultation
    lookup_peep_data: function() {
      var fanoutEnv = this.fanoutEnv, cells = this.cells;
      var authorTellKey = fanoutEnv.sentBy;
      var authorCellName = "d:p" + authorTellKey;
      if (!cells.hasOwnProperty(authorCellName))
        throw new $taskerror.UnauthorizedUserDataLeakError();
      var authorRootKey = cells[authorCellName];
      var authorIsOurUser = (authorRootKey ===
                             this.store._keyring.rootPublicKey);
      if (authorIsOurUser)
        return this.store._pubring;
      return this.store._db.getRowCell($lss.TBL_PEEP_DATA,
                                       authorRootKey, 'd:sident');
    },
    got_peep_data: function(authorSelfIdentOrPubring) {
      var fanoutEnv = this.fanoutEnv, cells = this.cells,
          convMeta = this.convMeta;
      var authorPubring, authorIsOurUser;
      if (authorSelfIdentOrPubring instanceof $pubring.PersonPubring) {
        authorPubring = authorSelfIdentOrPubring;
        authorIsOurUser = true;
      }
      else {
        authorPubring = $pubring.createPersonPubringFromSelfIdentDO_NOT_VERIFY(
                          authorSelfIdentOrPubring);
        authorIsOurUser = false;
      }
      var authorRootKey = this.authorRootKey = authorPubring.rootPublicKey;

      // - decrypt conversation envelope
      var convEnv = $msg_gen.assertGetConversationHumanMessageEnvelope(
                      fanoutEnv.payload, fanoutEnv.nonce, convMeta);

      // - decrypt conversation body
      var convBody = $msg_gen.assertGetConversationHumanMessageBody(
                       convEnv.body, fanoutEnv.nonce, convMeta,
                       fanoutEnv.receivedAt, authorPubring);


      // - persist the message
      var writeCells = this.writeCells = {};
      var msgNum = this.msgNum = writeCells["d:m"] = parseInt(cells["d:m"]) + 1;
      var msgRec = this.msgRec = {
        type: 'message',
        authorId: authorRootKey,
        composedAt: convBody.composedAt,
        receivedAt: fanoutEnv.receivedAt,
        text: convBody.body
      };
      writeCells["d:m" + msgNum] = msgRec;


      var timestamp = fanoutEnv.receivedAt;

      var promises = [
        this.store._db.putCells($lss.TBL_CONV_DATA, convMeta.id, writeCells),
      ];

      // - all recipients stuff
      var recipRootKeys = this.recipRootKeys = [];
      var authorCellName = "d:p" + fanoutEnv.sentBy;
      for (var key in cells) {
        if (!/^d:p/.test(key) || key === authorCellName)
          continue;
        // this must be the cell for one of the other recipients
        recipRootKeys.push(cells[key]);
      }

      const convPinned = false;

      // - conversation (all and per-peep) index updating
      var convIndexUpdates = this.convIndexUpdates = [],
          peepIndexMaxes = this.peepIndexMaxes = [];
      this.store._makeConvIndexUpdates(
        convMeta.id, convPinned, convIndexUpdates, peepIndexMaxes,
        authorRootKey, recipRootKeys, timestamp);
      promises.push(this.store._db.maximizeMultipleIndexValues(
                      $lss.TBL_PEEP_DATA, peepIndexMaxes));
      promises.push(this.store._db.updateMultipleIndexValues(
                      $lss.TBL_CONV_DATA, convIndexUpdates));

      // - author is not us
      if (!authorIsOurUser) {
        // - boost unread message count
        promises.push(this.store._db.incrementCell(
          $lss.TBL_PEEP_DATA, authorRootKey, 'd:nunread', 1));
        this.authorDelta = { numUnread: 1 };
      }
      else {
        this.authorDelta = null;
      }

      return $Q.all(promises);
    },
    generate_notifications: function(resolvedPromises) {
      // - peep notifications
      this.store._notifyPeepConvDeltas(
        this.authorRootKey, this.authorDelta,
        this.recipRootKeys, this.peepIndexMaxes);

      // - conversation notifications
      this.store._notifyModifiedConversation(
        this.convMeta.id, this.cells, this.writeCells,
        this.convIndexUpdates);

      // - "new" notification / convmsgs notification
      this.store._notif.trackNewishMessage(
        this.convMeta.id, this.msgNum, this.msgRec);

      this.store._log.conversationMessage(this.convMeta.id,
                                          this.fanoutEnv.nonce);
    },
  },
});

/**
 * Meta-data about a conversation from participants, potentially including us.
 *
 * We generate many fewer notifiations and byproducts than message receipt.
 *  Namely, we:
 * - Update live message representations with the read watermark fallout
 *    (removal from previously last read, addition for newly last read.)
 * - If it is our user, update blurbs' unread tallies and unread message
 *    reference (if appropriate).
 *
 * We do not:
 * - Touch conversation timestamps and thereby do not affect ordering.
 */
var ConvMetaTask = exports.ConvMetaTask = taskMaster.defineTask({
  name: 'convMeta',
  args: ['store', 'convMeta', 'fanoutEnv', 'cells'],
  steps: {
    lookup_peep_data: function() {
      var fanoutEnv = this.fanoutEnv, cells = this.cells;
      var authorTellKey = fanoutEnv.sentBy;
      var authorCellName = "d:p" + authorTellKey;
      if (!cells.hasOwnProperty(authorCellName))
        throw new $taskerror.UnauthorizedUserDataLeakError();
      var authorRootKey = cells[authorCellName];
      var authorIsOurUser = (authorRootKey ===
                             this.store._keyring.rootPublicKey);
      if (authorIsOurUser)
        return this.store._pubring;
      return this.store._db.getRowCell($lss.TBL_PEEP_DATA,
                                       authorRootKey, 'd:sident');
    },
    got_peep_data: function(authorSelfIdentOrPubring) {
      var fanoutEnv = this.fanoutEnv, cells = this.cells,
          convMeta = this.convMeta;
      var authorPubring, authorIsOurUser;
      if (authorSelfIdentOrPubring instanceof $pubring.PersonPubring) {
        authorPubring = authorSelfIdentOrPubring;
        authorIsOurUser = true;
      }
      else {
        authorPubring = $pubring.createPersonPubringFromSelfIdentDO_NOT_VERIFY(
                          authorSelfIdentOrPubring);
        authorIsOurUser = false;
      }
      var authorRootKey = this.authorRootKey = authorPubring.rootPublicKey;

      // - decrypt conversation envelope
      var convEnv = $msg_gen.assertGetConversationMetaMessageEnvelope(
                      fanoutEnv.payload, fanoutEnv.nonce, convMeta);

      // - decrypt conversation body
      var convBody = $msg_gen.assertGetConversationMetaMessageBody(
                       convEnv.body, fanoutEnv.nonce, convMeta,
                       fanoutEnv.receivedAt, authorPubring);

      // - prepare to persist the revised metadata
      var writeCells = {};
      var postMeta = writeCells["d:u" + authorRootKey] =
        convBody.userMeta;

      var highReadMsg = postMeta.lastRead || 0;

      // --- notifications
      var promises = [];
      var preMeta = cells["d:u" + authorRootKey];

      // -- us!
      if (authorIsOurUser) {
        var highMsg = cells["d:m"];

        // - find the first unread human message
        var unreadRep = null, unreadIndex = 0;
        for (var iMsg = highReadMsg + 1; iMsg <= highMsg; iMsg++) {
          if (cells["d:m" + iMsg].type === 'message') {
            unreadRep = cells["d:m" + iMsg];
            unreadIndex = iMsg;
            break;
          }
        }

        // - update conv blurb unread
        var store = this.store;
        this.store._notif.namespaceItemModified(
          NS_CONVBLURBS, convMeta.id, null, null, null, null,
          function deltaBlurb(clientData, querySource, frontDataDelta, convId) {
            // - client data rep
            clientData.data.pubMeta = postMeta;

            // - number of unread
            frontDataDelta.numUnread = highMsg - highReadMsg;

            // - forget old unread human message rep
            if (clientData.data.unread) {
              store._notif.findAndForgetDep(querySource, clientData,
                                            NS_CONVMSGS,
                                            convId + clientData.data.unread);
            }

            // - new unread human message rep
            if (unreadRep) {
              clientData.data.unread = unreadIndex;
              frontDataDelta.firstUnreadMessage =
                store._convertConversationMessage(
                  querySource, convId, unreadRep, unreadIndex);
            }
            else {
              clientData.data.unread = null;
              frontDataDelta.firstUnreadMessage = null;
            }
          });

        // - update peep blurb unreads (disk and queries)
        // Figure out what messages that were unread that are now considered
        //  read, issue the appropriate deltas against the peep cell and the
        //  in-memory blurb.  Build up an in-memory tally for this.
        var firstUnread = 1;
        if (preMeta && typeof(preMeta.lastRead) === 'integer') {
          firstUnread = preMeta.lastRead + 1;
        }
        var rootKeysAndTallies = {};
        for (var iUnread = firstUnread; iUnread <= highReadMsg; iUnread++) {
          unreadRep = cells["d:m" + iUnread];

          // joins do not count for per-peep unread counts
          if (unreadRep.type === 'message') {
            // Ignore messages that our user authored; we don't track our own
            //  unread count.
            if (unreadRep.authorId === authorRootKey)
              continue;
            if (!rootKeysAndTallies.hasOwnProperty(unreadRep.authorId))
              rootKeysAndTallies[unreadRep.authorId] = 0;
            rootKeysAndTallies[unreadRep.authorId]++;
          }
        }
        var nowreadRootKey, readCount;
        function genReadDelta(clientData, querySource, outDeltaRep) {
          clientData.data.numUnread -= readCount;
          outDeltaRep.numUnread = clientData.data.numUnread;
        }
        for (nowreadRootKey in rootKeysAndTallies) {
          readCount = rootKeysAndTallies[nowreadRootKey];

          promises.push(this.store._db.incrementCell(
            $lss.TBL_PEEP_DATA, nowreadRootKey, 'd:nunread', -readCount));
          this.store._notif.namespaceItemModified(
            NS_PEEPS, nowreadRootKey, null, null, null, null, genReadDelta);
        }
      }
      // -- not us!
      else {
        // - update read watermarks
        // remove read watermark if applicable
        if (preMeta && typeof(preMeta.lastRead) === 'integer') {
          this.store._notif.namespaceItemModified(
            NS_CONVMSGS, convId + preMeta.lastRead, null, null, null, null,
            function deltaOld(clientData, querySource, frontDataDelta, msgId) {
              if (!frontDataDelta.hasOwnProperty("unmark"))
                frontDataDelta.unmark = [];

              var peepData = store._notif.findAndForgetDep(
                               querySource, clientData, NS_PEEPS,
                               authorRootKey);
              frontDataDelta.unmark.push(peepData.localName);
            });
        }
        // generate read watermark
        if (postMeta && typeof(postMeta.lastRead) === 'integer') {
          this.store._notif.namespaceItemModified(
            NS_CONVMSGS, convId + postMeta.lastRead, null, null, null, null,
            function deltaNew(clientData, querySource, frontDataDelta, msgId) {
              if (!frontDataDelta.hasOwnProperty("mark"))
                frontDataDelta.mark = [];

              var peepData = store._deferringPeepQueryResolve(
                               querySource, authorRootKey, clientData.deps);
              frontDataDelta.mark.push(peepData.localName);
            });
        }
      }

      promises.push(this.store._db.putCells($lss.TBL_CONV_DATA, convMeta.id,
                                            writeCells));
      return $Q.all(promises);
    },
    all_done: function() {
      this.store._log.conversationMessage(this.convMeta.id,
                                          this.fanoutEnv.nonce);
    },
  }
});

}); // end define
