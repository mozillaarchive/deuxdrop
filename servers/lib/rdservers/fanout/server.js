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
 * The fanout role has no server-specific identity key but instead has a user
 *  provided identity key which the user has duly authorized.  The goal is to
 *  avoid letting the server select keys because then it could reuse keys and
 *  there is no obvious user benefit to that.  Since the user has to provide the
 *  server with the private key, there is distinctly no benefit to secrecy.
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
 * ### Notes migrated from the unit test (consolidating)
 *
 * Hypothetical how-it-works bits for the group conversation stuff (to be
 *  firmed up and relocated) based on conversation with davida.
 *
 * - Conversation creation.  The sender of the first message creates a new
 *    signing keypair whose public key serves as the identifier for the
 *    conversation.  A self-attestation is generated that specifies the
 *    following and is sent to the fanout server who will re-transmit it to
 *    all invitees:
 *   - The maildrop/mailsender information to use to contact the fanout node
 *      (much like for contacting a person).
 *   - The criteria used to define eligible membership in the group.  This would
 *      usually be an attestation that all of the initial participants are
 *      authorized and have delegation rights.
 *
 * - Conversation inviting.
 *   - The person inviting someone (if authorized) writes an attestation that
 *      they are inviting some identity (per public key) and clarified by that
 *      user's most recent self-attestation (providing contact endpoints) to the
 *      explicitly named conversation (per public key).  They include the
 *      attestation chain that authorized them to join the conversation and sign
 *      the whole thing as a block.  They then verify their own attestation to
 *      verify they truly are authorized.  The rationale for using a public
 *      key signature for the attestation is that the group needs to be able
 *      to determine who invited the person.
 *   - Tentatively, no content message (ex: "hey Jon, thought I'd add you") is
 *      associated with the invitation; instead the user is expected to just
 *      send a message to the list that the user will (eventually) see so that
 *      everyone can know why the user is being added.  I have no UX sign-off
 *      on this though, so no assumptions.
 *   - The inviter formulates a message with two or more notable parts and sends
 *      it to the fanout server to re-transmit once it has authorized the user
 *      to participate in the conversation.
 *     - The secret key for the conversation, encrypted with message body-level
 *        encryption so that the recipient and only the recipient can decrypt
 *        the messages.
 *     - The signed attestation chain, encrypted with envelope-level encryption
 *        so that the user's mailstore can automatically subscribe to the
 *        conversation on their behalf.
 *
 * - Fanout server invite request servicing.
 *   - The server receives a (boxed) transit-message from an existing
 *      participant.  Because of the properties of the box it is able to
 *      conclude it was authored by the participant and *it does not need to
 *      see or verify any signatures/attestations*.  We take this optimization
 *      because verifying a signature is significantly more expensive than
 *      authenticating the box.
 *   - The server extracts the payload which is symmetrically encrypted
 *      with the envelope key copy of the envelope body and which the fanout
 *      server cannot decrypt.  The envelope body contains envelope metadata
 *      and the symmetrically encrypted message payload (using the payload key).
 *      The message payload is a signed JSON object containing the payload.
 *   - The server re-transmits the payload as (boxed) transit-messages to
 *      all current participants.
 *
 *
 *
 * - Invitation receipt / joining (assuming immediate mailstore action).
 *   - The invited person's mailstore receives the invitation message.  A
 *      request is automatically generated to the fanout server for the user
 *      to join.  The request will include the current self-attestation.
 *   - The invitation is filed with the conversation so that a body-reading
 *      device is able to get at the secret-key to get at the contents.
 *      Note that every conversation datastore is going to include one of
 *      these suckers anyways.
 *
 * - Fanout server join request servicing.
 *   - The server receives the request and verifies the attestation chain
 *      given the attestation chain and the public key and nothing else.  In
 *      the future some kind of revocation/turnover BS would obviously be
 *      appropriate.  The main goal is that the server does not have to go
 *      looking for information.
 *   - If the verification passes: the user is added to the list of participants
 *      in the conversation, the backlog of messages is resent to the joiner,
 *      and the fanout server automatically generates a join notification
 *      which is sent to all participants.
 *
 *
 * REQUIREMENTS:
 * - Timely group communication should be possible even in the disconnected
 *    mailstore use-case.
 * - The fanout server should not be able to read the content of messages or
 *    forge messages to the group.
 *
 * TO CONSIDER:
 * - Include some automated time-horizon on conversations?  Not only for
 *    conversation cleanliness, but general algorithmic happiness and disk
 *    space usage happiness (and legal message retention policies.)
 * - Ability to leave a conversation?  (Current option is local nuking.)
 *
 * KEY POINTS:
 * - Messages are encrypted using a shared secret (that is encrypted using
 *    public key crypto when being given to people).
 * - The fanout server does not have to be fully trusted because it never has a
 *    (usable) copy of the symmetric encryption key.
 * - Conversation joiners must explicitly ask the server for a subscription
 *    with a signed blob.  This avoids race conditions about the joiner having
 *    authorized their maildrop to receive mails.
 * - Conversation backfill occurs on joining via standard delivery mechanisms.
 *    This is primarily done for consistency/simplicity.
 * - Everyone is automatically notified of new joins by the fanout server.
 * - Nonces serve as message-id's because we really don't want them reused.
 *    (The assumption is our crypto-primitives are not vulnerable to known
 *    plaintext attacks, especially ones that are highly random and thus
 *    unlikely to compress well.)
 *
 *
 * ## Messages Received
 * From account owners:
 * - Create new conversation.
 *
 * From conversation participants:
 * - Send human message to the conversation.
 * - Send machine message (meta-data) message to the conversation.
 * - "Server invite" request; one of two messages authored by the join requestor,
 *   this one asks the server to loop in the person.
 *
 * From non-participants:
 * - "User invite" request; the other of two messages authored by the join
 *    requestor, this one asks the user to accept requests from the server.  It
 *    may or may not be a redundant request.
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

/**
 * Process a conversation creation request from an account-holding user,
 *  creating the conversation and sending out the initial set of messages as
 *  duly authorized. Logic upstream of us is responsible for ensuring the
 *  account-holding-ness.
 */
var CreateConversationTask = taskMaster.defineTask({
  name: "createConversation",
  steps: {
    /**
     * Make sure all the crypto checks out for creating the conversation.
     */
    validateRequestCrypto: function() {
    },
    /**
     * Make sure the recipients are all known to us (and presumably we have a
     *  mutual relationship).
     */
    validateRequestRecipients: function() {
    },
    /**
     * Create the root database record if it does not exist, failing if it
     *  already does.  This is a race only in the event of a failure upstream or
     *  a badly behaved client and is a failure we accordingly want to draw
     *  attention to.  (If this were less rare, we would check this further
     *  upstream before we do some other db checks like recipient verification.)
     *
     * Note that because we do not have/require higher-level transactions, we
     *  use an expiring lock that will let through an identical task in the
     *  future if we have not marked the conversation as fully started before
     *  the expiration.
     */
    createConversationRootRace: function() {
    },
    /**
     * Send the messages to all the recipients, wait for the send layer to have
     *  reliably taken on their delivery.
     */
    sendMessages: function() {
    },
    /**
     * Mark the conversation as fully started.
     */
    finalizeConversationRoot: function() {
    },
  }
});

/**
 * Make sure the author of this message is in on the conversation.
 */
function commonVerifySenderIsAuthorized() {
}

/**
 * Add a human or machine-message to the conversation.  Machine-messages, such
 *  as per-user metadata blobs, may replace previous messages of the same type.
 */
var AddMessageToConversationTask = taskMaster.defineTask({
  name: "addMessageToConversation",
  steps: {
    verifySenderIsAuthorized: commonVerifySenderIsAuthorized,
    persistMessage: function() {
    },
    sendMessageToAll: function() {
    },
  }
});

var ServerInviteTask = taskMaster.defineTask({
  name: "serverInvite",
  steps: {
    verifySenderIsAuthorized: commonVerifySenderIsAuthorized,
    /**
     * Add the user to the conversation data structure, including creating and
     *  persisting the join notification message.
     */
    addUserToConversation: function() {
    },
    /**
     * Send the joining user all of the conversation backlog.
     */
    sendConversationBacklogToUser: function() {
    },
    /**
     * Send the join notification to all users on the conversation.
     */
    sendJoinMessageToAll: function() {
    },
  },
});



}); // end define
