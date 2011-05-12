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
    'exports'
  ],
  function(
    exports
  ) {

function StoreServerConnection() {
}
StoreServerConnection.prototype = {
  /**
   * The device tells us its device id, its current sequence id, and its
   *  replication level so we know who it is, when its last update was, and
   *  whether we need to force a re-sync.
   */
  _msg_init_deviceCheckin: function(msg) {
  },



  /**
   * Here's a composed message to send, perhaps with some meta-data.
   */
  _msg_root_send: function(msg) {
  },

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

  /**
   * Set meta-data on a conversation/messages.
   */
  _msg_root_setMeta: function(msg) {
  },

  /**
   * Delete messages in a conversation, possibly all of them.
   */
  _msg_root_delConvMsgs: function(msg) {
  },

  /**
   * Add a new contact with related-metadata for prioritization, etc.
   */
  _msg_root_addContact: function(msg) {
  },

  /**
   * Modify the metadata associated with a contact.
   */
  _msg_root_modContact: function(msg) {
  },

  /**
   * Delete a contact.
   */
  _msg_root_delContact: function(msg) {
  },
};

}); // end define
