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
 * The fanout role receives messages destined for a conversation, stores them
 *  for subsequent joins, forwards them onward, and handles join requests.
 *  It communicates with all involved parties using deuxdrop messages via
 *  maildrop/mailstore co-located in the same cluster as itself.  For this
 *  reason it is connection-less.
 *
 * ## Notes from conversation with Bryan just now:
 * - I will change the join protocol so it has to go through the fanout server
 *    so the fanout server does not have to deal with bearer bonds.
 * - It's okay to have conversations "die" for performance reasons, but we
 *    should have a "rekindle the conversation" option.
 *
 * ## Mental debate about bearer invite versus proxied w/introduction req.
 * - Original plan called for a bearer mechanism where the invited person
 *    provided the full attestation.  This is reasonably cheap to check other
 *    than the connection setup costs and the verification that we are actually
 *    servicing the conversation.
 * - Original plan also assumed the joiner would have setup their maildrop
 *    to be willing to receive those messages before presenting the join
 *    request, thereby assuring their server is ready to receive.
 * - New variant has a case where it needs to be introduced to the maildrop for
 *    a server it does not already have an established relationship with.  This
 *    seems reasonable but if it is done conditionally based on an already
 *    existing relationship could constitute an information leak (and one where
 *    people running their own server would leak the most).
 * - The other option which avoids the problem is to require a flow where it's
 *    not conditional with the downside of requiring additional traffic.
 *    Specifically, we could do "can I add bob?", "yes you can add bob...
 *    but you need to get permission from his server", "hey, server, please
 *    say this is cool",  "okay it's cool", "here's the permission".
 *
 * ## Messages Received
 * From account owners:
 * - Create new conversation.
 *
 * From conversation participants:
 * - Send human message to the conversation.
 * - Send machine message (meta-data) message to the conversation.
 * - Send invite request for another person to join.
 *
 * From non-participants:
 * X Join conversation using attestation.
 *
 * ## Messages Sent
 * To initial participants:
 * - Re-transmitted join messages.  (The conversation initiator could have
 *    sent these directly, but there would be a potential race, so we re-send
 *    for them.)
 *
 * To conversation participants:
 * - Human message in the conversation (from participant).
 * - Machine message (from participant)
 * - Join message (machine message from fanout server itself)
 * - Invite request introduction required: (when a join request is issued that
 *    requires the server to talk to a server it is not currently friends with)
 *
 * ## hbase data model: conversations
 * - row id: [owner id, conversation epoch, conversation id]
 * - column family: "x": the index of the conversations known to the server
 *   - "n": The next message sequence number.
 *   - "p:#...": Authorized identity public key => contact info.
 * - column family: "c": the actual conversation data.
 *   - "o": The current conversation self-attestation.
 *   - "m:####": strictly ordered message with given sequence number.  Human or
 *      machine messages that fit into the timeline from the perspective of
 *      the fanout node (including join notifications which include the
 *      attestation chains).
 *   - "r:#...": Latched per-recipient meta-data for storing watermarks where
 *      new data clobbers existing data.  All other meta-data should go under
 *      "m".
 **/

define(
  [
    'exports'
  ],
  function(
    exports
  ) {

var CreateConversationTask = taskMaster.defineTask({
  name: "createConversation",
  steps: {
  }
});

/**
 * Add a human or machine-message to the conversation.  Machine-messages, such
 *  as per-user metadata blobs, may replace previous messages of the same type.
 */
var AddMessageToConversationTask = taskMaster.defineTask({
  name: "addMessageToConversation",
  steps: {
  }
});

var ProcessInviteTask = taskMaster.defineTask({
  name: "processInvite",
});



}); // end define
