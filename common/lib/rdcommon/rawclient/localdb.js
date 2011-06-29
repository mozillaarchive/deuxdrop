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
    'exports'
  ],
  function(
    exports
  ) {

/**
 * Data on peeps, be they a contact or a transitive-acquaintance we heard of
 *  through a conversation.
 */
const TBL_PEEP_DATA = "peepData";
/**
 * Conversation data.
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
const IDX_PEEP_CONV_WRITE_INVOLVEMENT = "idxPeepConvWrite";
const IDX_PEEP_CONV_ANY_INVOLVEMENT = "idxPeepConvAny";
/**
 * The list of peeps ordered by conversation activity recency.
 */
const IDX_PEEP_RECENCY = "idxPeepRecency";

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
};

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
function LocalStore(dbConn) {
  this._db = dbConn;

  this._db.defineHbaseTable(TBL_PEEP_DATA, ["d"]);
  // conversation data proper: meta, overview, data
  this._db.defineHbaseTable(TBL_CONV_DATA, ["m", "o", "d"]);

  this._db.defineReorderableIndex(IDX_ALL_CONVS);
  this._db.defineReorderableIndex(IDX_PEEP_CONV_INVOLVEMENT);
}
exports.LocalStore = LocalStore;
LocalStore.prototype = {
  //////////////////////////////////////////////////////////////////////////////
  // Internal Helpers

  _validateAndParseAuthedJSON: function() {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Notifications

  __notifyNewMessagesInConversation: function(convId, msgDataItems) {

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
  // Conversation Mutation

  /**
   * A new conversation (from our perspective) as defined by its metadata; the
   *  join notifications/etc. come separately .  Store the meta-information so
   *  that we can do things with the conversation in the future.
   */
  addConversation: function(convMeta) {
    // - generate the conversation table entry
  },

  /**
   * Our own meta-data about a conversation (pinned, etc.)
   */
  setConversationMeta: function() {
    // -- update any subscribed queries on pinned
    // -- update any blurbs for this conversation
  },

  /**
   * Meta-data about a conversation from other participants.
   */
  setConversationPeepMeta: function() {
    // -- update anyone subscribed to the full conversation
  },

  /**
   * Add a message (human or machine) to a conversation.
   *
   * If this is a join notification, we will name-check the added person.
   */
  addConversationMessage: function() {
    // --- human message
    // -- write
    // -- update the all-conversations index
    // -- update the author's write involvement view
    // -- for all subscribed peeps, update the any involvement view

    // -- posit potential notification (might be taken back by metadata update)

    // --- metadata message
    // -- write
    // -- posit latched notification for active subscribers
    // -- nuke pending new message notification if our user saw something...

    // --- join message
    // -- add entry in the joined author's any involvement view
  },

  /**
   * Our user has composed a message to a conversation; track it for UI display
   *  but be ready to nuke it when the actual message successfully hits the
   *  conversation.
   */
  outghostAddConversationMessage: function() {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Peep Lookup

  /**
   * @args[
   *   @param[by @oneof['recency' 'alphabet']]
   *   @param[filter @oneof[null 'pinned']]
   * ]
   */
  queryAndWatchPeepBlurbs: function(by) {
  },

  loadAndWatchPeepBlurb: function() {
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
   */
  addContact: function() {
    // -- persist
    // -- notify peep queries
  },

  /**
   * Set some meta-data about a contact in our address book (pinned, etc.)
   */
  setContactMeta: function() {
    // -- persist
    // -- notify affected queries
    // -- notify subscribed blurbs
  },

  /**
   * Set some contact-provided meta-data about a contact in our address book.
   */
  /*
  setContactPeepMeta: function() {
  },
  */

  /*
  delContact: function() {
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
   */
  _nameTrack: function(tellKey, otherPersonSelfIdent) {
  },

  /**
   * A previously namechecked name is no longer relevant because the conversation
   *  is being expired, etc.
   */
  _nameGone: function() {
  },


  //////////////////////////////////////////////////////////////////////////////
};

}); // end define