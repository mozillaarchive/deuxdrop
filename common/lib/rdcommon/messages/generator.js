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
 * @typedef[CryptoConversationAnchor @dict[
 *   @key[rootAttestation ConvAttestation]{
 *     The current self-attestation that defines the conversation public key and
 *     fanout server contact info.
 *   }
 *   @key[membershipChain AliasingAuthorization]{
 *     The authorization that loops us into the conversation.  This will
 *     likely include the `rootAttestation` as the root of the authorization
 *     chain.  The reason for the potential redundancy is future-fodder
 *     endpoint change support.
 *
 *     The authorization is aliasing which is to say that part of each link
 *     provides a human readable alias which will be used under the SDSI model
 *     (bob's jim's tom) as fallback if the key is not already known.
 *   }
 *   @key[convEnvKey PubEncSecretKey]{
 *     The shared secret key used for the envelope, encrypted with one of our
 *     active identity envelope public keys.
 *   }
 *   @key[convBodyKey PubEncSecretKey]{
 *     The shared secret key used for the conversation, encrypted with one of
 *     our active identity body public keys.  Names key hashes.
 *   }
 * ]]{
 *
 * }
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
 * ]{
 *   Person to Server transit outer envelope; this is what the mailsender can
 *   see and hands to the other server's maildrop.
 * }
 * @typedef[PSTransitInnerEnvelope @dict[
 *   @key[type @oneof[
 *     @case["user"]{
 *       A user; this is a direct message.  `name` will hold the target user's
 *       root public key.  `payload` will hold the boxed message to the user.
 *     }
 *     @case["convadd"]{
 *       Our fanout server; this is a request to add a user to the conversation.
 *       `convId` will be the name of the conversation.  `payload` will be the
 *       attestation chain.
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
 *     }
 *   }
 *   @key[name]
 *   @key[serverName]
 *   @key[convId]
 *   @key[payload]
 * ]]{
 *   Person to server transit inner envelope; its contents are only for the
 *   receiving maildrop.  It gets boxed by the sending user.
 *
 *   Ideally we should split this into a polymorphic doc based on the type.
 * }
 *
 * @typedef[ConvAddPayload @dict[
 *   @key[userEnvelopeKey]{
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
 *   @key[nonce]
 *   @key[payload]
 * ]]{
 *   Server-to-server transit envelope; from the fanout server on the other
 *   server to a user on our server.
 * }
 *
 * @typedef[ConversationWelcomeMessage @dict[
 *   @key[boxedMeta]
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
 *   @key[receivedAt DateMS]
 *   @key[nonce]
 *   @key[payload ConversationEnvelopeEncrypted]
 * ]]{
 *   The (boxed) envelope from the fanout server to each participant in the
 *   conversation for things sent to the conversation.  This names the
 *   sender's key rather than having the conversation envelope name it because
 *   only the fanout server is able to perform such a verification (unless we
 *   use a public signature, which is too expensive for us at this time.)
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
 **/

define(
  [
    'rdcommon/crypto/keyops',
    'exports'
  ],
  function(
    $keyops,
    exports
  ) {


/**
 * Create a conversation and return the meta-info that all participants need
 *  plus the conversation-starter-only info.
 */
exports.createNewConversation = function(starterKeyring, serverIdentPayload) {
  // - create the new signing keypair that defines the conversation
  var convKeypair = $keyops.makeGeneralSigningKeypair();

  // XXX we're going to keep the keypair around for now, but it isn't actually
  //  used for anything.  The attestation checking is too expensive to do
  //  on the server right now (given there is no real payoff), so there's not
  //  much point flinging that around.  We are keeping it around just to make
  //  sure that the conversation starter keeps some extra meta-data so there
  //  isn't too much of a logistical hassle down the road to bring attestations
  //  back.

  // - create the symmetric secret keys (envelope, body) for the conversation
  var envelopeSharedSecretKey = $keyops.makeSecretBoxKey();
  var bodySharedSecretKey = $keyops.makeSecretBoxKey();

  // the actual information required to participate in the conversation...
  var convMeta = {
    id: convKeypair.publicKey,
    envelopeSharedSecretKey: envelopeSharedSecretKey,
    bodySharedSecretKey: bodySharedSecretKey,
    // this both names who to contact and is used for encryption; we don't
    //  bind the url into the conversation info; the mailsender will have it on
    //  file.
    transitServerKey: serverIdentPayload.publicKey,
  };

  return {
    keypair: convKeypair,
    participantMeta: convMeta,
  };
};

/**
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
  // -- for the conversation participants (not the fanout server)
  // - generate signed attestation to be sent to the list


  // - encrypt the attestation with the message key

  // -- for the invitee
  // (sekret detailz about the conversation)
  // - encrypt the shared secret keys into

  // -- for the fanout server itself (includes both of the above)
  // - create this invitation, jerk.

  // -- for their fanin server (nests the above)
  // - tell the server to authorize incoming messages for the conversation


  // - give it the encrypted conversation details to feed to the user



};

exports.createConversationHumanMessage = function(bodyString, authorKeyring,
                                                  convMeta) {
  // (for the conversation participants)
  var now = Date.now();
  var bodyObj = {
    author: authorKeyring.getPublicKeyFor('messaging', 'announceSign'),
    convId: convMeta.id,
    composedAt: now,
    body: bodyString,
  };
  var bodyJsonStr = JSON.stringify(bodyObj);
  var bodySigned = authorKeyring.signWith(bodyJsonStr,
                                          'messaging', 'announceSign');

  var nonce = $keyops.makeSecretBoxNonce();
  var bodyEncrypted = $keyops.secretBoxUtf8(bodySigned, nonce,
                                            convMeta.bodySharedSecretKey);

  var envelopeObj = {
    // so, ideally there would be something interesting that could go in here,
    //  but it's not clear what would be useful, especially because we don't
    //  really authenticate the envelope.
    body: bodyEncrypted,
  };
  var envelopeJsonStr = JSON.strigify(envelopeObj);
  var envelopeEncrypted = $keyops.secretBoxUtf8(
                            envelopeJsonStr, nonce,
                            convMeta.envelopeSharedSecretKey);
};

exports.assertGetConversationHumanMessageEnvelope = function(envelopeEncrypted,
                                                             nonce,
                                                             convMeta) {
  var envelopeJsonStr = $keyops.secretBoxOpenUtf8(
                          envelopeEncrypted, nonce,
                          convMeta.envelopeSharedSecretKey);
  return JSON.parse(envelopeJsonStr);
};

/**
 * @args[
 *   @param[bodyEncrypted]
 *   @param[nonce]
 *   @param[convMeta]
 *   @param[authorPubring]{
 *     The pubring of the supposed author of this message as conveyed to us by
 *     the transit envelope from the fanout server.
 *   }
 * ]
 */
exports.assertGetConversationHumanMessageBody = function(bodyEncrypted,
                                                         nonce,
                                                         convMeta,
                                                         receivedTS,
                                                         authorPubring) {
  var bodySigned = $keyops.secretBoxOpenUtf8(bodyEncrypted, nonce,
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

exports.encryptHumanToHuman = function(obj, nonce,
                                       authorKeyring, recipPubring) {
  var jsonStr = JSON.stringify(obj);
  authorKeyring.boxWith(jsonStr, nonce,
                        recipPubring.getPublicKeyFor('messaging', 'bodyBox'),
                        'messaging', 'tellBox');
};

/**
 *
 */
exports.encryptTransitMessage = function(senderFullIdent,
                                         envelope, payload,
                                         recipPubIdent) {

  var nonce = $nacl.box_random_nonce;
  var strPayload = JSON.stringify(payload);
  var encPayload = $nacl.box(strPayload, nonce,
                             recipPubIdent.payloadPubKey,
                             senderFullIdent.secret.authorshipBoxSecKey);

  var dupEnvelope = {};
  for (var key in envelope) {
    dupEnvelope[key] = envelope[key];
  }
  dupEnvelope.payload = encPayload;

  var strEnvelope = JSON.stringify(dupEnvelope);
  var encEnvelope = $nacl.box(strEnvelope, nonce,
                              recipPubIdent.envelopePubKey,
                              senderFullIdent.secret.authorshipBoxSecKey);


};

}); // end define
