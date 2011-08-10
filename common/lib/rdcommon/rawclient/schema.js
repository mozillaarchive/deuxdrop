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

/**
 * Data on peeps, be they a contact or a transitive-acquaintance we heard of
 *  through a conversation.
 *
 * row id: root key
 *
 * - d:oident - The signed other person ident issued by us if they are a
 *               contact, otherwise not present.
 * - d:sident - The most recent self-ident for the user.
 * - d:meta - Full metadata dictionary object, issued by us.
 * - d:schain - The shortest trust chain between us and this person.  In the
 *    case they are a contact of ours, this is an array containing a single
 *    entry naming our name for the person.  If they are not a contact,
 *    it contains a list of entries naming each person's name for the next
 *    person.
 * - d:gi### - Graph-in edge; the other-ident poco payload issued by someone
 *    else describing this peep, identified by their root key.  This is a form
 *    of primitive social graph.
 * - d:go### - Graph-out edge; no payload.
 *
 * - d:nunread - The number of unread messages from this user.
 * - d:nconvs - The number of conversations involving the user.
 */
exports.TBL_PEEP_DATA = "peepData";
/**
 * Contacts by their display name (as we so named them).
 *
 * Peeps are inserted into this view index when we add them as contacts.
 */
exports.IDX_PEEP_CONTACT_NAME = 'idxPeepName';

/**
 * Peeps by recency of messages they have written to conversations (the user is
 *  involved in).
 *
 * Peeps are inserted into this view index when we add them as a contact or
 *  when they write a message to a conversation (even if not added as a
 *  contact).  The correctness of the latter is up for debate; the thing we are
 *  trying to avoid is having to do a sweep to figure out the right values if
 *  we haven't been keeping this up-to-date.  (nb: it wouldn't be hard to do
 *  that since the peep per-conv index is and should be always maintained, we
 *  just have to query it.)
 */
exports.IDX_PEEP_WRITE_INVOLVEMENT = "idxPeepWrite";
/**
 * Peeps by recency of messages the user have written to conversations they are
 *  in.
 *
 * Insertion happens similarly to `IDX_PEEP_WRITE_INVOLVEMENT`, but not on
 *  contact addition.
 */
exports.IDX_PEEP_RECIP_INVOLVEMENT = "idxPeepRecip";
/**
 * Peeps by recency of activity in any conversation they are involved in,
 *  even if it was just a third party in the coversation posting a message.
 *
 * Insertion happens as in `IDX_PEEP_WRITE_INVOLVEMENT`.
 */
exports.IDX_PEEP_ANY_INVOLVEMENT = "idxPeepAny";

/**
 * Conversation data.
 *
 * row id: conversation id
 *
 * - d:meta - The conversation meta-info for this conversation.
 * - d:p### - Maps participant tell key to their root key.
 * - d:m - High message number
 * - d:m# - Message number #.  Fully decrypted rep.
 * - d:u### - Per-user metadata by tell key, primarily used for watermarks.
 * - d:ourmeta - Our user's metadata about the conversation, primarily used
 *                for pinned status.
 */
exports.TBL_CONV_DATA = "convData";
/**
 * The master conversation ordered view; all converations our user is in on.
 */
exports.IDX_ALL_CONVS = "idxConv";

/**
 * The per-peep conversation involvement view (for both contact and non-contact
 *  peeps right now.)
 */
exports.IDX_CONV_PEEP_WRITE_INVOLVEMENT = "idxPeepConvWrite";
exports.IDX_CONV_PEEP_RECIP_INVOLVEMENT = "idxPeepConvRecip";
exports.IDX_CONV_PEEP_ANY_INVOLVEMENT = "idxPeepConvAny";

exports.dbSchemaDef = {
  tables: [
    {
      name: exports.TBL_PEEP_DATA,
      columnFamilies: ['d'],
      indices: [
        exports.IDX_PEEP_CONTACT_NAME,
        exports.IDX_PEEP_WRITE_INVOLVEMENT,
        exports.IDX_PEEP_RECIP_INVOLVEMENT,
        exports.IDX_PEEP_ANY_INVOLVEMENT,
      ],
    },
    {
      name: exports.TBL_CONV_DATA,
      columnFamilies: ['d'],
      indices: [
        exports.IDX_ALL_CONVS,
        exports.IDX_CONV_PEEP_WRITE_INVOLVEMENT,
        exports.IDX_CONV_PEEP_RECIP_INVOLVEMENT,
        exports.IDX_PEEP_ANY_INVOLVEMENT,
      ],
    },
  ],

  queues: [
  ],
};

}); // end define
