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
 * Mailstore user-behalf data storage.
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

const TBL_CONTACTS = 'store:userContacts';

const TBQ_CLIENT_REPLICAS = "store:clientQueues";

const TBL_CONVERSATIONS = 'store:userConversations';

const IDX_PEEP_WRITE_INVOLVEMENT = "store:idxPeepWrite";
const IDX_PEEP_RECIP_INVOLVEMENT = "store:idxPeepRecip";
// XXX this could be problematic with large converation sizes...
const IDX_PEEP_ANY_INVOLVEMENT = "store:idxPeepAny";

const IDX_CONV_PEEP_WRITE_INVOLVEMENT = "store:idxPeepConvWrite";
const IDX_CONV_PEEP_ANY_INVOLVEMENT = "store:idxPeepConvAny";


exports.initializeUserTable = function(dbConn) {
  dbConn.defineHbaseTable(TBL_CONTACTS, ["d"]);

  dbConn.defineReorderableIndex(TBL_CONTACTS,
                                IDX_PEEP_WRITE_INVOLVEMENT);
  dbConn.defineReorderableIndex(TBL_CONTACTS,
                                IDX_PEEP_RECIP_INVOLVEMENT);
  dbConn.defineReorderableIndex(TBL_CONTACTS,
                                IDX_PEEP_ANY_INVOLVEMENT);

  dbConn.defineHbaseTable(TBL_CONVERSATIONS, ["m", "d"]);
  dbConn.defineReorderableIndex(TBL_CONVERSATIONS,
                                IDX_CONV_PEEP_WRITE_INVOLVEMENT);
  dbConn.defineReorderableIndex(TBL_CONVERSATIONS,
                                IDX_CONV_PEEP_ANY_INVOLVEMENT);

  dbConn.defineQueueTable(TBQ_CLIENT_REPLICAS);
};

/**
 * User data stored on behalf of the user by the mailstore (which can only see
 *  envelope data in an unencrypted form).  Data is generally intended to be
 *  regurgitated to a smart-ish client which has a copy of the body encryption
 *  key and can decrypt everything into a presentation state using that.
 *
 * @args[
 *   @param[userRowBit]{
 *     What identifier to use for this user in row names.  Initially we are
 *     just going to use the user's root key.  We may eventually want to opt for
 *     a slightly more compact representation for efficiency reasons.  (nb: A
 *     straight-up incrementing value is probably not a better choice.)
 *   }
 * ]
 */
function UserBehalfDataStore(userRowBit, dbConn) {
  this._userRowBit = userRowBit;
  this._db = dbConn;
}
exports.UserBehalfDataStore = UserBehalfDataStore;
UserBehalfDataStore.prototype = {
  //////////////////////////////////////////////////////////////////////////////
  // Client Queues

  clientQueuePeek: function(clientPublicKey) {
    return this._db.queuePeek(TBQ_CLIENT_REPLICAS, clientPublicKey, 1);
  },

  clientQueueConsumeAndPeek: function(clientPublicKey) {
    return this._db.queueConsumeAndPeek(
                  TBQ_CLIENT_REPLICAS, clientPublicKey, 1, 1);
  },
  clientQueuePush: function(clientPublicKey, payload) {
    var listy = [payload];
    return this._db.queueAppend(TBQ_CLIENT_REPLICAS, clientPublicKey, listy);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Contacts

  newContact: function(contactRootKey, replicaAddBlock) {
    return this._db.putCells(TBL_CONTACTS,
                             this._userRowBit + contactRootKey,
                             {'d:addBlock': replicaAddBlock});
  },

  //////////////////////////////////////////////////////////////////////////////
  // Conversations
  //
  // We store everything in the boxed fanout message from the transit server as
  //  it was received.  We do this just to leave the messages on-disk in an
  //  encrypted format.  This does not provide the user or clients with any
  //  guarantee that the outer envelopes we have access to have not been
  //  forged; because of the box semantics, we ourselves (or anyone who
  //  compromises us in a way that gains them access to the envelope secret key)
  //  can forge these (or new) outer boxes.
  //
  // Row: [user prefix, conversation id]
  //
  // Cells:
  // - m:i - The invitation envelope and required context data.
  // - m:m - The current high message number.
  // - m:p### - Indicate the involvement of user tell key '###' in the
  //    conversation.
  // - d:m# - Message number '#'; this covers all non-conversation-level
  //    metadata.
  // - d:e### - Per-user metadata for tell key '###'.

  /**
   * Store the
   */
  newConversationRace: function(conversationId, invitationEnvContext) {
    return this._db.raceCreateRow(TBL_CONVERSATIONS,
                                  this._userRowBit + conversationId,
                                  "m:race",
                                  {"m:i": invitationEnvContext});
  },

  /**
   * Retrieve the
   */
  getConversationRootMeta: function(conversationId) {
    return this._db.getRow(TBL_CONVERSATIONS,
                           this._userRowBit + conversationId, "m");
  },

  /**
   * Add a message to the conversation, optionally boosting peep index values.
   */
  addConversationMessage: function(conversationId, highMsgNum,
                                   rawMsgWithContext) {
    var cells = {
      "m:m": highMsgNum + 1,
    };
    cells["d:m" + highMsgNum] = rawMsgWithContext;
    return this._db.putCells(TBL_CONVERSATIONS,
                             this._userRowBit + conversationId,
                             cells);
  },

  /**
   * Update the per-peep conversation view indices; in other words, update the
   *  ordered lists of conversations the peep is involved in.
   */
  touchConvPeepRecencies: function(conversationId, timestamp,
                                   writerPeepId,
                                   recipientPeepIds) {
    var promises = [];
    // - writer
    promises.push(this._db.maximizeIndexValue(
      TBL_CONVERSATIONS, IDX_CONV_PEEP_WRITE_INVOLVEMENT, writerPeepId,
      conversationId, timestamp));
    // - recipients
    for (var iRecip = 0; iRecip < recipientPeepIds.length; iRecip++) {
      var recipPeepId = recipientPeepIds[iRecip];
      promises.push(this._db.maximizeIndexValue(
        TBL_CONVERSATIONS, IDX_CONV_PEEP_ANY_INVOLVEMENT, recipPeepId,
        conversationId, timestamp));
    }

    return $Q.all(promises);
  },

  setConversationPerUserMetadata: function(conversationId, tellKey,
                                           rawMsgWithContext) {
    var cells = {};
    cells["d:e" + tellKey] = rawMsgWithContext;
    return this._db.putCells(TBL_CONVERSATIONS,
                             this._userRowBit + conversationId,
                             cells);
  },

  //////////////////////////////////////////////////////////////////////////////
};

}); // end define
