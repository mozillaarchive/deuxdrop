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
 * XXX we currently use a JSON-persistable in-memory store.
 *
 * An optimization we are capable of performing is that we do not have to store
 *  things in a particularly encrypted form.  This allows us to potentially
 *  save a lot of CPU/power.
 *
 * Local storage implementation assuming a SQLite-based backend with a slight
 *  bias towards SSD storage.  More specifically, we are going to try and avoid
 *  triggering behaviours that result in a large number of random writes (since
 *  SSDs are good at random reads and linear writes).  This means trying to
 *  minimize the number of b-tree pages that are touched.
 *
 * Our implementation is problem domain aware.
 */
function LocalStore() {
}
LocalStore.prototype = {
  //////////////////////////////////////////////////////////////////////////////
  // Conversation

  /**
   * A new conversation (from our perspective).
   */
  addConversation: function() {
  },

  /**
   * Our own meta-data about a conversation (pinned, etc.)
   */
  setConversationMeta: function() {
  },

  /**
   * Meta-data about a conversation from other participants.
   */
  setConversationPeepMeta: function() {
  },

  /**
   * Add a message (human or machine) to a conversation.
   */
  addConversationMessage: function() {
  },

  /**
   * Our user has composed a message to a conversation; track it for UI display
   *  but be ready to nuke it when the actual message successfully hits the
   *  conversation.
   */
  outghostAddConversationMessage: function() {
  },


  //////////////////////////////////////////////////////////////////////////////
  // Contacts

  /**
   * Add a contact to our address book.
   */
  addContact: function() {
  },

  /**
   * Set some meta-data about a contact in our address book.
   */
  setContactMeta: function() {
  },

  /**
   * Set some contact-provided meta-data about a contact in our address book.
   */
  setContactPeepMeta: function() {
  },

  delContact: function() {
  },

  //////////////////////////////////////////////////////////////////////////////
};

}); // end define
