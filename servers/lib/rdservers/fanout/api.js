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
    'exports'
  ],
  function(
    exports
  ) {

const TBL_CONV_DATA = "fanout:convData";

/**
 * Provides database access for conversation data; authorizations to participate
 *  in a conversation (and thereby subscriptions) are handled by the `AuthApi`.
 *  I agree it's slightly confusing.
 *
 * Right now all storage is named solely using the conversation id rather
 *  than a tuple of the owning user and the conversation id.  This is acceptable
 *  as long as we treat conversation ids as a land-grab (with extremely low
 *  probability of collision) and make sure that other parties cannot abuse it.
 *  This entails checking for conversation authorizations prior to using this
 *  API and preferably using collision-aware creation mechanisms.
 */
function FanoutApi(serverConfig, dbConn, _logger) {
  this._db = dbConn;

  this._db.defineHbaseTable(TBL_CONV_DATA, ["o", "m"]);
}
exports.Api = FanoutApi;
FanoutApi.prototype = {
  //////////////////////////////////////////////////////////////////////////////
  // Conversation Write

  /**
   *
   */
  createConversation: function(convId, ownerRootKey) {
    var cells = {
      "o:owner": ownerRootKey,
    };
    return this._db.raceCreateRow(TBL_CONV_DATA, convId, "o:race", cells);
  },

  /**
   * Add a message, human or machine, to the ordered data in the conversation.
   *
   * @args[
   *   @param[fanoutMessage ConversationFanoutEnvelope]{
   *     The unencrypted fanout nonce; this will be boxed to each participant in
   *     the conversation (even the sender).
   *   }
   * ]
   */
  addMessageToConversation: function(convId, fanoutMessage) {
    // XXX using an increment adds a lot of cost here because we have to issue
    //  a read where otherwise we would not need to do so.  On the other hand,
    //  it's pretty concise.  Once we move to queue processing, we could
    //  leverage that to ensure we avoid collisions within the cell at the cost
    //  of a larger value and more correlation.  Another alternative in the
    //  hbase model is to just use randomish values and rely on the timestamps
    //  to establish ordering.  (If we totally abused versioning, we could avoid
    //  many issues except for then not being able to bound the versions
    //  retained for the meta-data without losing the read clustering.)
    var self = this;
    return when(this._db.incrementCell(TBL_CONV_DATA, convId, "m:m", 1),
      function(valAfterIncr) {
        var cells = {};
        cells["m:m" + valAfterIncr] = fanoutMessage;
        return self._db.putCells(TBL_CONV_DATA, convId, cells);
      }
      // rejection pass-through is fine
      );
  },

  /**
   * Update a user's metadata on a conversation (watermarks, etc.)
   */
  updateConvPerUserMetadata: function(convId, userKey, userMeta) {
    var cells = {};
    cells["m:u" + userMeta] = userMeta;
    return this._db.putCells(TBL_CONV_DATA, convId, cells);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Conversation Read

  /**
   * Get all the data about a conversation to bring a user up-to-speed on the
   *  conversation.
   */
  getAllConversationData: function(convId) {
    return when(this._db.getRow(TBL_CONV_DATA, convId, ["m"]),
      function(cells) {
        var msgs = [];
        var last = parseInt(cells["m:m"]);
        // accumulate the non-meta messages
        for (var i = 1; i <= last; i++) {
          var msg = cells["m:m" + i];
          msgs.push(msg);
        }
        // now add all the meta messages
        for (var key in cells) {
          if (key[2] === "u") {
            msgs.push(cells[key]);
          }
        }

        return msgs;
      }
      // rejection pass-through is fine
    );
  },


  //////////////////////////////////////////////////////////////////////////////
};

}); // end define
