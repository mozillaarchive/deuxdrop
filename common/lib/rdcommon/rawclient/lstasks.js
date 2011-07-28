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
    'rdcommon/crypto/pubring',
    './schema',
    'module',
    'exports'
  ],
  function(
    $Q,
    $log,
    $task, $taskerrors,
    $pubring,
    $lss,
    $module,
    exports
  ) {

var LOGFAB = exports.LOGFAB = $log.register($module, {
});

var taskMaster = $task.makeTaskMasterForModule($module, LOGFAB);

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
      this.isContactAdd = (typeof(this.peepOident) === 'string');
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
          writeCells['d:nconvs'] = cells['d:nconvs'] + 1;
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
      if (!cells.hasOwnProperty(chainKey)) {
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
      // XXX IDX_PEEP_CONTACT_NAME for addContact!!
      return this.store._db.putCells($lss.TBL_PEEP_DATA,
                                     this.peepPubring.rootPublicKey,
                                     this.writeCells);
    },
    generate_notifications: function() {
      if (this.isContactAdd)
        this.store._notif.namespaceItemAdded(NS_PEEPS,
                                             this.peepPubring.rootPublicKey,
                                             this.cells, this.writeCells);
      else
        this.store._notif.namespaceItemModified(NS_PEEPS,
                                                this.peepPubring.rootPublicKey,
                                                this.cells, this.writeCells,
                                                'd:nconvs');
    },
    all_done: function() {
      return this.peepPubring;
    },
  },
});

/**
 * Process a conversation invitation by validating its attestation and
 *  creating the appropriate database row.  The conversation will not become
 *  visible to the user until at least one message has been processed.
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
      cells["d:p" + creatorPubring.getPublicKeyFor('messaging', 'tellBox')] =
        creatorPubring.rootPublicKey;
      var self = this;
      return when(this.store._db.putCells(TBL_CONV_DATA, convMeta.id, cells),
                  function() {
                    self.store._log.newConversation(convMeta.id);
                  });
    },
  },
});

/**
 * Process a join message.
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
      // PeepNameTrackTask may retrieve data from this row too, it might make
      //  sense to rejigger out interaction with it so we only issue one read.
      return this.store._db.getRowCell($lss.TBL_PEEP_DATA,
                                       inviterRootKey,
                                       'd:sident');
    },
    got_inviter_selfident: function(inviterSelfIdent) {
      var inviterPubring = this.inviterPubring =
        $pubring.createPersonPubringFromSelfIdentDO_NOT_VERIFY(
          inviterSelfIdent);

      // - unsbox the attestation
      var signedAttestation = $keyops.secretBoxOpen(
                                fanoutEnv.payload, fanoutEnv.nonce,
                                this.convMeta.bodySharedSecretKey);
      // - validate the attestation
      var oident = $msg_gen.assertCheckConversationInviteAttestation(
                     signedAttestation, inviterPubring, this.convMeta.id,
                     fanoutEnv.receivedAt);

      return new PeepNameTrackTask(
        { store: this.store, oident: oident, othPubring: inviterPubring },
        this.log);
    },
    // PeepNameTrackTask returns the pubring from the oident to be nice.
    update_conv_data: function(inviteePubring) {
      var inviterRootKey = this.inviterPubring.rootPublicKey;
      var inviteeRootKey = inviteePubring.rootPublicKey;

      var writeCells = {};
      // - add the invitee as an authorized participant by their tell key
      writeCells["d:p" + this.fanoutEnv.invitee] = inviteeRootKey;
      // - add the join entry in the message sequence
      var msgNum = writeCells["d:m"] = parseInt(this.cells["d:m"]) + 1;
      writeCells["d:m" + msgNum] = {
        type: 'join',
        by: inviterRootKey,
        id: inviteeRootKey,
        receivedAt: this.fanoutEnv.receivedAt,
      };

      // XXX update in-memory reps
      var timestamp = this.fanoutEnv.receivedAt;

      var self = this;
      return $Q.join(
        this.store._db.putCells(TBL_CONV_DATA, convMeta.id, writeCells),
        // - create peep conversation involvement index entry
        this.store._db.updateIndexValue(
          TBL_CONV_DATA, IDX_CONV_PEEP_ANY_INVOLVEMENT, inviteeRootKey,
          convMeta.id, timestamp),
        // - touch peep activity entry
        this.store._db.maximizeIndexValue(
          TBL_PEEP_DATA, IDX_PEEP_ANY_INVOLVEMENT, '', inviteeRootKey,
          timestamp),
        // - boost their involved conversation count
        this.store._db.incrementCell(TBL_PEEP_DATA, inviteeRootKey,
                                     'd:nconvs', 1),
        function() {
          self.store._log.conversationMessage(convMeta.id, fanoutEnv.nonce);
        }
      );
    },
  },
});

/**
 * Add a message (human or machine) to a conversation.
 *
 * If this is a join notification, we will name-check the added person.
 */
var ConvMessageTask = exports.ConvMessageTask = taskMaster.defineTask({
  name: 'convMessage',
  args: ['store', 'convMeta', 'fanoutEnv', 'cells'],
  steps: {
    all: function() {
      var fanoutEnv = this.fanoutEnv;
      var authorTellKey = fanoutEnv.sentBy;
      var authorCellName = "d:p" + authorTellKey;
      if (!cells.hasOwnProperty(authorCellName))
        throw new $taskerror.UnauthorizedUserDataLeakError();
      var authorPubring =
        $pubring.createPersonPubringFromSelfIdentDO_NOT_VERIFY(
          cells[authorCellName]);
      var authorRootKey = authorPubring.rootPublicKey;

      var authorIsOurUser = (authorRootKey ===
                             this.store._keyring.rootPublicKey);

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
        receivedAt: fanoutEnv.receivedAt,
        text: convBody.body
      };
      writeCells["d:m" + msgNum] = msgRec;

      // - message notification
      this.store._notif.trackNewishMessage(convMeta.id, msgNum, msgRec);

      var timestamp = fanoutEnv.receivedAt;

      var promises = [
        this.store._db.putCells(TBL_CONV_DATA, convMeta.id, writeCells),
        // -- conversation indices
        // - all conversation index
        // - per-peep conversation indices
      ];

      // - all recipients stuff
      var recipRootKeys = [];
      for (var key in cells) {
        if (!/^d:p/.test(key) || key === authorCellName)
          continue;
        // this must be the cell for one of the other recipients
        recipRootKeys.push(cells[key]);
      }

      this.store._updateConvIndices(convMeta.id, /* pinned */ false,
                                    authorRootKey, recipRootKeys, timestamp);

      // - author is not us
      if (!authorIsOurUser) {
        // - peep indices
        promises.push(this.store._db.maximizeIndexValue(
          TBL_PEEP_DATA, IDX_PEEP_WRITE_INVOLVEMENT, '',
          authorRootKey, timestamp));
        // - boost unread message count
        promises.push(this.store._db.incrementCell(
          TBL_PEEP_DATA, authorRootKey, 'd:nunread', authorIsOurUser ? 0 : 1));
      }

      // XXX notifications
      var self = this;
      return $Q.join(
        function() {
          self.store._log.conversationMessage(convMeta.id, fanoutEnv.nonce);
        }
      );
    },
  },
});

/**
 * Meta-data about a conversation from other participants.
 */
var ConvMetaTask = exports.ConvMetaTask = taskMaster.defineTask({
  name: 'convMeta',
  args: ['store', 'convMeta', 'fanoutEnv', 'cells'],
  steps: {
    all: function() {
    // -- update anyone subscribed to the full conversation


    // --- metadata message
    // -- write
    // -- posit latched notification for active subscribers
    // -- nuke pending new message notification if our user saw something...
    },
  }
});

}); // end define
