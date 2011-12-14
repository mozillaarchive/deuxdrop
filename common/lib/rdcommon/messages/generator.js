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
 * Create a fully formed message for transport.
 *
 * All of the below data types are currently implemented using JSON, but will
 * be converted into avro representations (or other efficiently packed
 * representations) eventually.
 *
 *
 * @typedef[PSTransitOuterEnvelope @dict[
 *   @key[senderKey]{
 *     The tellBoxPubKey of the sending user.
 *   }
 *   @key[nonce]{
 *     The nonce used for all of the layers of this message composed by the
 *     user.  Consumers should keep this around; re-published layers should
 *     get the nonce attached in a new envelope.
 *   }
 *   @key[innerEnvelope @naclBoxed[PSTransitInnerEnvelope]]
 * ]]{
 *   Person to Server transit outer envelope; this is what the mailsender can
 *   see and hands to the other server's maildrop.
 * }
 * @typedef[PSTransitInnerEnvelope @message[
 *   #:sender PersonAgent
 *   #:recipient Server
 *   @key[type]
 *     @case["convadd"]{
 *       Our fanout server; this is a request to add a user to the conversation.
 *       `convId` will be the name of the conversation.  `payload` will be the
 *       attestation chain.  `name` will be the added user's tell pub key.
 *     }
 *     @case["convmsg"]{
 *       Our fanout server; this is a human message to a conversation.  `name`
 *       will not be present.  `convId` will be the name of the conversation.
 *       `payload` will be the message to relay to the conversation.
 *     }
 *     @case["convmeta"]{
 *       Our fanout server; this is a per-user metadata update for a
 *       conversation.  `name` will not be present.  `convId` will be the name
 *       of the conversation.  `payload` will be the message to relay to the
 *       conversation.
 *     }
 *     @case["createconv"]{
 *       Our fanout server from our user; request to create a conversation.
 *     }
 *     @case["joinconv"]{
 *       Fanin-ish; this is a user asking the target user to join a
 *       conversation.  `name` will hold the root public key of the target user.
 *       `convId` will be the name of the conversation.  `serverName` will be
 *       the public boxing key of the server hosting the conversation. `payload`
 *       will be the message to send back to our server when the operation has
 *       been completed.
 *
 *       This could alternatively have been implemented as an operation a user
 *       dispatches to their own server's conversation server that asks another
 *       server synchronously to perform.  We didn't do this because it would
 *       deviate from all the other one-way stuff we are doing here.  Also,
 *       it does allow the user to optionally decide to intercede in the flow
 *       of the joining process.
 *     }
 *     @case["resend"]{
 *       Retransmit the provided message as part of the "joined" step; this
 *       value is a required value rather than a dispatch value to avoid
 *       weird replay attacks.  Note that because the conversation "joined"
 *       step is currently stateless, a jerk actor can keep telling us the
 *       "joined" message.  This is effect harmless because conversation
 *       adding is idempotent, but can have bandwidth/traffic ramifications.
 *       This can be dealt with by requiring the packet to include an expiration
 *       date and having us use (tupled) nonce-based replay suppression.
 *
 *       `name` and `convId` are not needed since this is just wrapping
 *       a transit message and `serverName` tell us all we need to know.
 *       We add a `nonce` because of the potential for nonce reuse in the
 *       case where we are trying to resend a message to ourself.  In such
 *       a case we could instead special-case self-detection and assume and
 *       require that the nested payload is not encrypted, but for now, this
 *       is simplest.  (Note that nonce reuse in the case of self-nested
 *       payloads is probably safe because the decrypted nested payload is only
 *       exposed to us, but better safe than sorry.)
 *     }
 *   ]]
 *   @key[name]
 *   @key[serverName]
 *   @key[convId]
 *   @key[payload]
 * ]]{
 *   Person to server transit inner envelope; its contents are only for the
 *   receiving maildrop.  It gets boxed by the sending user.
 * }
 *
 * @typedef[UserPSTransitInnerEnvelope @extend[PSTransitInnerEnvelope
 *   @key[type "user"]
 *   @key[name UserRootPublicKey]{
 *     Target user's root key.
 *   }
 *   @key[payload BoxedUserToUserEnvelope]{
 *     Boxed message to the user.
 *   }
 * ]]{
 *   User-to-user direct message.
 * }
 *
 * @typedef[ConvAddPSTransitInnerEnvelope @extend[PSTransitInnerEnvelope
 *   @key[type "convadd"]
 *   @key[convId]
 * ]]{
 *
 * }
 * @typedef[ConvMsgPSTransitInnerEnvelope @extend[PSTransitInnerEnvelope
 *   @key[type "convmsg"]
 *   @key[convId ConversationId]{
 *     The name of the conversation the message is to.
 *   }
 *   @key[payload BoxedConversationEnvelope]
 * ]]{
 *   A human message to a conversation being relayed to the fan-out server.
 * }
 *
 * @typedef[ConvAddPayload @dict[
 *   @key[envelopeKey]{
 *     The user's envelope key for encrypting fanout messages to the user (so
 *     that their mailstore can process the messages).
 *   }
 *   @key[inviteePayload]{
 *     The boxed message containing the conversation metadata from the inviter
 *     to the invitee to be delivered as part of the welcome payload.
 *   }
 *   @key[attestationPayload]{
 *     A conversation encrypted message containing the identity information of
 *     the person being added.  This is unreadable by the fanout server because
 *     it does not need to know the details of who this person is.
 *   }
 * ]]{
 *   Similar to the items in the `ConvCreatePayload` addPayloads entry, but
 *   without fields that are implicit from the containing envelope.
 * }
 *
 * @typedef[ConvCreatePayload @dict[
 *   @key[addPayloads @listof[@dict[
 *     @key[nonce]
 *     @key[tellKey]
 *     @key[envelopeKey]{
 *       The user's envelope key for encrypting fanout messages to the user (so
 *       that their mailstore can process the messages).
 *     }
 *     @key[serverKey]
 *     @key[inviteePayload]{
 *       The boxed message containing the conversation metadata from the inviter
 *       to the invitee to be delivered as part of the welcome payload.
 *     }
 *     @key[attestationPayload]{
 *       A conversation encrypted message containing the identity information of
 *       the person being added.  This is unreadable by the fanout server because
 *       it does not need to know the details of who this person is.
 *     }
 *     @key[inviteProof]{
 *       A boxed message analogus to a join request from the conversation
 *       creator to the transit server of the recipient.
 *     }
 *     @key[proofNonce]{
 *       The nonce the proof was boxed with.
 *     }
 *   ]]]{
 *     Add payloads of the people the creator is adding to the conversation,
 *     but not for the creator themselves.  (The metadata about the creator
 *     comes in the root conversation attestation.)
 *
 *     Note that this dict's fields are assumed by
 *     `convInitialAuthorizeMultipleUsers`.
 *   }
 *   @key[msgNonce]
 *   @key[msgPayload ConversationEnvelopeEncrypted]
 * ]]
 *
 * @typedef[SSTransitEnvelope @dict[
 *   @key[type @oneof[
 *     @case["joined"]{
 *       Fanin-ish; the response to a "joinconv" request once it has been
 *       accomplished.  `payload` will be a message that our user composed to
 *       us as part of the invitation process but we have not previously
 *       seen.  Also note that this will be the first we have heard of this
 *       invitation, as the previous step was a direct message from our user
 *       to the invited user's maildrop/fanout server.  (Accordingly, the
 *       nonce used can be/is the same as the nonce used for the "joinconv"
 *       message.)  `name` names the user who issued the joinconv message by
 *       their tell key and who should be the author of the payload which should
 *       correspond to an (encrypted) `PSTransitInnerEnvelope`.
 *     }
 *     @case["initialfan"]{
 *       A conversation welcome message authenticated on the basis of the
 *       initiating user's relationship with the contact rather than
 *       a pre-existing per-conversation authorization (induced by a "join"
 *       message.)  It will include `senderKey` denoting the sender (tell key)
 *       for this purpose and `proof` which is the conversation id boxed by said
 *       sender to the transit server as proof of it being their request.
 *     }
 *     @case["fannedmsg"]{
 *       A conversation message.  `payload` will be a boxed message from the
 *       fanout server to the `name`d user.  `convId` will name the
 *       conversation.
 *     }
 *   ]]{
 *   }
 *   @key[name]{
 *     The tell public box key of the recipient user.
 *   }
 *   @key[convId]{
 *     The conversation this is a message for.
 *   }
 *   @key[senderKey #:optional]
 *   @key[proof #:optional]
 *   @key[nonce]
 *   @key[payload]
 * ]]{
 *   Server-to-server transit envelope; from the fanout server on the other
 *   server to a user on our server.
 * }
 *
 * @typedef[ConversationWelcomeMessage @dict[
 *   @key[boxedInvite]
 *   @key[backlog @listof[ConversationFanoutEnvelope]]
 * ]]{
 *   Contains the conversation meta-data from the inviter in a boxed message
 *   from the inviter, plus all of the conversation backlog.
 * }
 *
 * @typedef[ConversationFanoutEnvelope @dict[
 *   @key[type @oneof[
 *     @case["message"]{
 *       A human-readable conversation to the message by one of the
 *       participants.
 *     }
 *     @case["join"]{
 *       A join notification for a new participant; contains the attestation
 *       (authored by the inviter) about who the invitee is (to the inviter).
 *       `sentBy` contains the tell key of the inviter, `invitee` contains the
 *       tell key of the invited.
 *     }
 *     @case["usermeta"]{
 *       User metadata about the conversation as a whole, likely their
 *       watermarks.  This is made known to the fan-out server as an
 *       optimization so that it does not need to replay meta-data to joining
 *       participants that is obsolete.  (This could also contain metadata
 *       about specific messages embedded in it if it wants.)
 *     }
 *     @case["welcome"]{
 *       The recipient is being added to the conversation just now and
 *       `payload` contains an array of `ConversationFanoutEnvelope` instances.
 *
 *       This exists as a hybrid of an optimization (less message traffic, fewer
 *       crypto operations) and an attempt to expose less information about the
 *       conversation to the invitee's server.  Note that without padding, the
 *       size of the aggregate may still reveal a lot of information.  It may
 *       make sense to nuke this special case.
 *     }
 *   ]]
 *   @key[sentBy]{
 *     The tell key of the sending user.
 *   }
 *   @key[invitee #:optional]{Only present for 'join' notifications}
 *   @key[receivedAt DateMS]
 *   @key[nonce]
 *   @key[payload ConversationEnvelopeEncrypted]
 * ]]{
 *   The (boxed) envelope from the fanout server to each participant in the
 *   conversation for things sent to the conversation.  This names the
 *   sender's key rather than having the conversation envelope name it because
 *   only the fanout server is able to perform such a verification (unless we
 *   use a public signature, which is too expensive for us at this time.)
 *
 *   The conversation id is explicitly provided in the wrapping
 *   `SSTransitEnvelope` and should be re-boxed along with the nonce when being
 *   provided to the user, etc.
 * }
 * @typedef[ConversationFanoutEnvelopeEncrypted
 *          @naclBoxed[ConversationFanoutEnvelope serverBox userEnvelopeBox]]
 *
 * @typedef[ConversationEnvelope @dict[
 *   @key[body ConversationBodyEncrypted]
 * ]]{
 *   The conversation envelope is encrypted with the conversation's envelope
 *   (symmetric) secret key using the nonce providing in one the containing
 *   objects.
 *
 *   Although this block is not signed, we have a optimistically reliable
 *   indicator of the author of this message thanks to the enclosing
 *   `ConversationFanoutEnvelope` and its boxing.
 *
 *   XXX This may be an unneeded level of wrapping.  We would put stuff in here
 *   that the participants in the conversation don't want the fan-out server
 *   to see in terms of envelope data.
 * }
 * @typedef[ConversationEnvelopeEncrypted
 *          @naclSecretBoxed[ConversationEnvelope convEnvelopeSecretKey]]
 *
 * @typedef[ConversationBody @dict[
 *   @key[author AnnounceSignPubKey]
 *   @key[convId]
 *   @key[composedAt DateMS]{
 *     Composition date of the message.
 *   }
 *   @key[body String]
 * ]]{
 * }
 *
 * @typedef[ConversationBodySigned @naclSigned[ConversationBodyPayload author]]{
 *   The body signed by the author using
 * }
 *
 * @typedef[ConversationBodyEncrypted
 *          @naclSecretBoxed[ConversationBodySigned convBodySecretKey]]{
 * }
 *
 * @typedef[ConversationAttestation @dict[
 *   @key[id]
 *   @key[createdAt DateMS]
 *   @key[creatorSelfIdent]
 *   @key[transitServer]
 * ]]
 *
 * @typedef[ConverationInviteAttestation @dict[
 *   @key[issuedAt DateMS]
 *   @key[signingKey]{
 *     The announceSign key used by the inviter.
 *   }
 *   @key[convId]
 *   @key[oident]
 * ]]{
 *   The signed attestation provided to the members of a conversation that
 *   serves to name the invitee and say who invited them in a strong way that
 *   a rogue fanout server cannot fake.
 *
 *   Note that the attestation is signed by the 'announceSign' signature key
 *   rather than a longterm key (which *is* used to sign the other person
 *   ident).  This is consistent with our use of the 'announceSign' key to sign
 *   content messages to the conversation issued by the user.  (And that choice
 *   is part of our design decision to keep the longterm key fairly precious and
 *   rarely needed.)
 * }
 **/

define(
  [
    'rdcommon/crypto/keyops',
    'rdcommon/taskerrors',
    'rdcommon/identities/pubident',
    'exports'
  ],
  function(
    $keyops,
    $taskerrors,
    $pubident,
    exports
  ) {

/**
 * @typedef[ConvMeta @dict[
 *   @key[id]
 *   @key[envelopeSharedSecretKey]
 *   @key[bodySharedSecretKey]
 *   @key[transitServerKey]
 *   @key[signedAttestation ConversationAttestation]
 * ]]
 **/

/**
 * Create a conversation and return the meta-info that all participants need
 *  plus the conversation-starter-only info.
 *
 * @return[@dict[
 *   @key[keypair]
 *   @key[convMeta ConvMeta]
 * ]]
 */
exports.createNewConversation = function(authorKeyring, authorSelfIdentBlob,
                                         serverIdentPayload) {
  // - create the new signing keypair that defines the conversation
  var convKeypair = $keyops.makeGeneralSigningKeypair();

  // - create the symmetric secret keys (envelope, body) for the conversation
  var envelopeSharedSecretKey = $keyops.makeSecretBoxKey();
  var bodySharedSecretKey = $keyops.makeSecretBoxKey();

  // - generate the attestation that roots the conversation.
  var attestPayload = {
    id: convKeypair.publicKey,
    createdAt: Date.now(),
    creatorSelfIdent: authorSelfIdentBlob,
    transitServer: serverIdentPayload.publicKey,
  };
  var signedAttestation = $keyops.generalSignUtf8(
                            JSON.stringify(attestPayload), convKeypair);

  // the actual information required to participate in the conversation...
  var convMeta = {
    id: convKeypair.publicKey,
    envelopeSharedSecretKey: envelopeSharedSecretKey,
    bodySharedSecretKey: bodySharedSecretKey,
    // this both names who to contact and is used for encryption; we don't
    //  bind the url into the conversation info; the mailsender will have it on
    //  file.
    transitServerKey: serverIdentPayload.publicKey,
    signedAttestation: signedAttestation,
  };

  return {
    keypair: convKeypair,
    meta: convMeta,
  };
};

/**
 * Verify the self-validity of a conversation attestation and matches our
 *  expectations.  Specifically:
 * - it is a valid self-signed blob
 * - that the signing key is consistent with the conversation id as named outside
 *    the blob
 * - that it contains a valid self-ident for the creator of the conversation
 */
exports.assertGetConversationAttestation = function(signedAttestation,
                                                    checkConversationId) {
  // verify its self-validity
  var peeked = JSON.parse(
                 $keyops.generalPeekInsideSignatureUtf8(signedAttestation));
  $keyops.generalVerifySignatureUtf8(signedAttestation, peeked.id);
  // verify it matches the expected conversation id
  if (checkConversationId !== peeked.id)
    throw new Error('Conversation id mismatch!');
  // verify it contains a valid self-attestation of the creator
  $pubident.assertGetPersonSelfIdent(peeked.creatorSelfIdent);

  return peeked;
};

/**
 * Generate a conversation add request.  This is used both at the start of the
 *  conversation and to add later, but `createConversationJoinWrapper` must
 *  be used to wrap late-additions.
 *
 * @args[
 *   @param[authorKeyring DelegatedKeyring]
 *   @param[otherPersonIdentSigned OtherPersonIdentSigned]{
 *     The author's previously generated signature that states who the person
 *     is to us.
 *   }
 *   @param[convMeta]{
 *     The information all participants needs.
 *   }
 *   @param[recipPubring PersonPubring]
 * ]
 */
exports.createConversationInvitation = function(authorKeyring,
                                                otherPersonIdent,
                                                convMeta,
                                                recipPubring) {
  var now = Date.now();
  var attestSNonce = $keyops.makeSecretBoxNonce(),
      inviteNonce = $keyops.makeBoxNonce();

  // -- for the conversation participants (not the fanout server)
  // - generate signed attestation to be sent to the list
  // The attestation is stating that we are explicitly binding this person into
  //  the conversation and therefore names the conversation.  This avoids
  //  some frame-jobs based on replays; obviously, if someone creates a
  //  conversation with the same name, that's insufficient.
  var attestPayload = {
    issuedAt: now,
    signingKey: authorKeyring.getPublicKeyFor('messaging', 'announceSign'),
    convId: convMeta.id,
    oident: otherPersonIdent
  };
  var signedAttestation = authorKeyring.signUtf8With(
                            JSON.stringify(attestPayload),
                            'messaging', 'announceSign');

  // - encrypt the attestation with the conv body key
  var sboxedAttestation = $keyops.secretBox(signedAttestation, attestSNonce,
                                            convMeta.bodySharedSecretKey);

  // -- for the invitee
  // (sekret detailz about the conversation)
  // - body key layer
  var inviteBody = {
    bodySharedSecretKey: convMeta.bodySharedSecretKey,
    signedAttestation: convMeta.signedAttestation,
  };
  var boxedInviteBody = authorKeyring.boxUtf8With(
                          JSON.stringify(inviteBody), inviteNonce,
                          recipPubring.getPublicKeyFor('messaging', 'bodyBox'),
                          'messaging', 'tellBox');

  // - envelope key layer
  var inviteEnv = {
    convId: convMeta.id,
    transitServerKey: convMeta.transitServerKey,
    envelopeSharedSecretKey: convMeta.envelopeSharedSecretKey,
    payload: boxedInviteBody,
  };
  var boxedInviteEnv = authorKeyring.boxUtf8With(
                         JSON.stringify(inviteEnv), inviteNonce,
                         recipPubring.getPublicKeyFor('messaging',
                                                      'envelopeBox'),
                         'messaging', 'tellBox');

  return {
    nonce: inviteNonce,
    boxedInvite: boxedInviteEnv,
    attestSNonce: attestSNonce,
    signedAttestation: sboxedAttestation,
  };
};

/**
 * Box the conversation id and invitee name from the conversation author to the
 *  transit server of the invitee as proof of invitation for freshly created
 *  conversations.  This allows us to avoid the extra round-trips of the join
 *  mechanism.
 */
exports.createInviteProof = function(authorKeyring, convMeta, recipPubring) {
  var inviteProofPayload = {
    name: recipPubring.rootPublicKey,
    convId: convMeta.id,
  };
  var nonce = $keyops.makeBoxNonce();
  var boxedInviteProof = authorKeyring.boxUtf8With(
                           JSON.stringify(inviteProofPayload), nonce,
                           recipPubring.transitServerPublicKey,
                           'messaging', 'tellBox');
  return {nonce: nonce, boxedInviteProof: boxedInviteProof};
};

/**
 * Create a conversation add request wrapped in a join request.  The join
 *  request gets sent to the person to add so that they pre-authorize their
 *  server, then they resend what's inside back afterwards which is the actual
 *  add request.
 */
exports.createConversationAddJoin = function(authorKeyring,
                                             ourServerKey,
                                             convMeta,
                                             recipPubring,
                                             inviteInfo) {
  // Nonce book-keeping:
  // (Note that all servers may be identical and even though we may be nesting
  //  payloads in a potentially safe way, we're not going to risk it.  Better
  //  safe than too clever.)
  //
  // - inviteNonce:
  //   - boxedInviteBody: (author tell, invitee body)
  //   - boxedInviteEnv:  (author tell, invitee env)
  //   - boxedConvAdd:    (author tell, conversation server)
  // - resendNonce:
  //   - boxedResend:     (author tell, author server)
  // - joinNonce:
  //   - boxedJoinConv:   (author tell, recipient server)



  // -- for the fanout server itself (includes both of the above)
  // - convadd request
  var convAddInnerEnv = {
    type: 'convadd',
    name: recipPubring.getPublicKeyFor('messaging', 'tellBox'),
    serverName: recipPubring.transitServerPublicKey,
    convId: convMeta.id,
    payload: {
      envelopeKey: recipPubring.getPublicKeyFor('messaging', 'envelopeBox'),
      inviteePayload: inviteInfo.boxedInvite,
      attestationPayload: inviteInfo.signedAttestation,
      attestationNonce: inviteInfo.attestSNonce,
    }
  };

  // - which gets boxed to the transit server
  var boxedConvAdd = authorKeyring.boxUtf8With(
                       JSON.stringify(convAddInnerEnv),
                       inviteInfo.nonce,
                       convMeta.transitServerKey,
                       'messaging', 'tellBox');

  // -- for our fanin server to resend to the transit server (nests the above)
  var resendNonce = $keyops.makeBoxNonce();
  var resend = {
    type: 'resend',
    serverName: convMeta.transitServerKey,
    nonce: inviteInfo.nonce,
    payload: boxedConvAdd,
  };
  var boxedResend = authorKeyring.boxUtf8With(
                      JSON.stringify(resend), resendNonce,
                      ourServerKey,
                      'messaging', 'tellBox');

  var joinNonce = $keyops.makeBoxNonce();

  // -- for their fanin server (nests the above)
  // - "joinconv" message to their maildrop
  var joinConvInnerEnv = {
    type: 'joinconv',
    name: recipPubring.rootPublicKey,
    serverName: convMeta.transitServerKey,
    convId: convMeta.id,
    nonce: resendNonce,
    payload: boxedResend,
  };

  var boxedJoinConv = authorKeyring.boxUtf8With(
                        JSON.stringify(joinConvInnerEnv), joinNonce,
                        recipPubring.transitServerPublicKey,
                        'messaging', 'tellBox');

  var joinConvOuterEnv = {
    senderKey: authorKeyring.getPublicKeyFor('messaging', 'tellBox'),
    nonce: joinNonce,
    innerEnvelope: boxedJoinConv
  };

  return joinConvOuterEnv;
};

/**
 * Check a conversation invite attestation, verifying the attestation signature,
 *  the enclosed other ident, and the self-ident inside of that.
 *
 * @args[
 *   @param[signedAttestation ConversationInviteAttestationSigned]
 *   @param[checkAuthorPubring Pubring]
 *   @param[convId]
 *   @param[timestamp DateMS]
 * ]
 * @return[OtherPersonIdentPayload]
 */
exports.assertCheckConversationInviteAttestation =
    function(signedAttestation, checkAuthorPubring, convId, timestamp) {
  var attestPayload = checkAuthorPubring.assertGetSignedSelfNamingPayload(
                        signedAttestation, timestamp,
                        'signingKey', 'issuedAt',
                        'messaging', 'announceSign');
  if (attestPayload.convId !== convId)
    throw new $taskerrors.MalformedOrReplayPayloadError();
  var oidentPayload = $pubident.assertGetOtherPersonIdent(attestPayload.oident,
                                      checkAuthorPubring, timestamp);
  var selfIdentPayload = $pubident.assertGetPersonSelfIdent(
                           oidentPayload.personSelfIdent);
  return oidentPayload;
};

/**
 * XXX I have not done anything with the inResponse stuff posited...
 *
 * @args[
 *   @param[bodyString String]{
 *     The plaintext message what for humans to read and comprehend.
 *   }
 *   @param[authorKeyring]
 *   @param[convMeta]
 *   @param[inResponseToNonce]{
 *     The nonce that was used for the message sent to the conversation.
 *   }
 *   @param[inResponseToSignedBlob]{
 *     The signed blob that this message is a response to.  This is used to
 *     compute a hash that we embed in the message in order to reduce the
 *     probability of successful frame-jobs.  This is not intended to be a
 *     strong protection at this time; we would want to include more data
 *   }
 * ]
 */
exports.createConversationHumanMessage = function(bodyString, authorKeyring,
                                                  convMeta,
                                                  inResponseToNonce,
                                                  inResponseToSignedBlob) {
  // (for the conversation participants)
  var now = Date.now();
  var bodyObj = {
    author: authorKeyring.getPublicKeyFor('messaging', 'announceSign'),
    convId: convMeta.id,
    composedAt: now,
    body: bodyString,
  };
  var bodyJsonStr = JSON.stringify(bodyObj);
  var bodySigned = authorKeyring.signUtf8With(bodyJsonStr,
                                              'messaging', 'announceSign');

  var nonce = $keyops.makeSecretBoxNonce();
  var bodyEncrypted = $keyops.secretBox(bodySigned, nonce,
                                        convMeta.bodySharedSecretKey);

  var envelopeObj = {
    // so, ideally there would be something interesting that could go in here,
    //  but it's not clear what would be useful, especially because we don't
    //  really authenticate the envelope.
    body: bodyEncrypted,
  };
  var envelopeJsonStr = JSON.stringify(envelopeObj);
  var envelopeEncrypted = $keyops.secretBoxUtf8(
                            envelopeJsonStr, nonce,
                            convMeta.envelopeSharedSecretKey);

  return {nonce: nonce, payload: envelopeEncrypted};
};

/**
 * Create a metadata message.
 */
exports.createConversationMetaMessage = function(userMeta, authorKeyring,
                                                 convMeta) {
  // (for the conversation participants)
  var now = Date.now();
  var bodyObj = {
    author: authorKeyring.getPublicKeyFor('messaging', 'announceSign'),
    convId: convMeta.id,
    composedAt: now,
    userMeta: userMeta,
  };
  var bodyJsonStr = JSON.stringify(bodyObj);
  var bodySigned = authorKeyring.signUtf8With(bodyJsonStr,
                                              'messaging', 'announceSign');

  var nonce = $keyops.makeSecretBoxNonce();
  var bodyEncrypted = $keyops.secretBox(bodySigned, nonce,
                                        convMeta.bodySharedSecretKey);

  var envelopeObj = {
    // so, ideally there would be something interesting that could go in here,
    //  but it's not clear what would be useful, especially because we don't
    //  really authenticate the envelope.
    body: bodyEncrypted,
  };
  var envelopeJsonStr = JSON.stringify(envelopeObj);
  var envelopeEncrypted = $keyops.secretBoxUtf8(
                            envelopeJsonStr, nonce,
                            convMeta.envelopeSharedSecretKey);

  return {nonce: nonce, payload: envelopeEncrypted};
};


/**
 * Open the conversation envelope message.
 */
exports.assertGetConversationHumanMessageEnvelope = function(envelopeEncrypted,
                                                             nonce,
                                                             convMeta) {
  var envelopeJsonStr = $keyops.secretBoxOpenUtf8(
                          envelopeEncrypted, nonce,
                          convMeta.envelopeSharedSecretKey);
  return JSON.parse(envelopeJsonStr);
};
exports.assertGetConversationMetaMessageEnvelope =
  exports.assertGetConversationHumanMessageEnvelope;

/**
 * Open the conversation body message.
 *
 * @args[
 *   @param[bodyEncrypted]
 *   @param[nonce]
 *   @param[convMeta]
 *   @param[authorPubring]{
 *     The pubring of the supposed author of this message as conveyed to us by
 *     the transit envelope from the fanout server.  Needed for the signing key.
 *   }
 * ]
 */
exports.assertGetConversationHumanMessageBody = function(bodyEncrypted,
                                                         nonce,
                                                         convMeta,
                                                         receivedTS,
                                                         authorPubring) {
  var bodySigned = $keyops.secretBoxOpen(bodyEncrypted, nonce,
                                         convMeta.bodySharedSecretKey);
  var peekedBodyObj = JSON.parse(
                        $keyops.generalPeekInsideSignatureUtf8(bodySigned));
  // make sure the signature is consistent with its payload
  $keyops.generalVerifySignatureUtf8(bodySigned, peekedBodyObj.author);
  // make sure the signing key is consistent with the alleged author
  authorPubring.assertValidKeyAtTime(peekedBodyObj.author, receivedTS,
                                     'messaging', 'announceSign');
  return peekedBodyObj;
};
exports.assertGetConversationMetaMessageBody =
  exports.assertGetConversationHumanMessageBody;

exports.encryptHumanToHuman = function(obj, nonce,
                                       authorKeyring, recipPubring) {
  var jsonStr = JSON.stringify(obj);
  authorKeyring.boxUtf8With(jsonStr, nonce,
                            recipPubring.getPublicKeyFor('messaging', 'bodyBox'),
                            'messaging', 'tellBox');
};

}); // end define
