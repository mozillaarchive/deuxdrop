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
 * @typedef[TransitEnvelope @dict[
 *   @key[senderKey]{
 *   }
 *   @key[recipKey]{
 *   }
 *   @key[nonce]{
 *     The randomly generated nonce used for all encryption for this message and
 *     sub-parts.  When the transit envelope gets stripped, the payload should
 *     be re-encapsulated with the nonce so lower level consumers have it.
 *   }
 *   @key[version Integer]{
 *     Schema version for sanity checking; there is no support for inter-version
 *     operation during the development phase, but we want to be able to detect
 *     such an attempt and fail-fast.
 *   }
 *   @key[payload BoxedPayload]{
 *     Something boxed between the sender and recipient with the given nonce.
 *   }
 * ]]{
 *    A box with the meta-data to identify the sender and recipient so we know
 *    what keys were used in the boxing without having to try multiple keys.
 *    The nonce is also included because we need to know that.
 * }
 *
 * @typedef[StorageEnvelope @dict[
 *   @key[convId]{
 *     Conversation-id, an opaque randomly generated identifier for the
 *     conversation.
 *   }
 *   @key[composedAt DateMS]{
 *     Composition date of the message.
 *   }
 *   @key[payload EncMessagePayload]{
 *   }
 * ]]{
 *   The storage envelope contains meta-data about the message that is for use
 *   by the mailstore (and friends) to be able to classify/prioritize the mail
 *   without needing to see the actual message contents in the `MessagePayload`.
 * }
 *
 * @typedef[MessagePayload @dict[
 *   @key[subject #:optional String]{
 *     Proposed (new) subject for the conversation, if present.
 *   }
 *   @key[body String]{
 *     The message payload, presently plaintext, eventually simplified HTML
 *     (most likely).
 *   }
 * ]]{
 *   The message payload contains the actual contents of the message.
 * }
 *
 * @typedef[ConversationFanoutEnvelopePayload @dict[
 *   @key[sentBy]
 *   @key[envelope ConversationEnvelopeEncrypted]
 * ]]{
 *   The (boxed) envelope for things sent to the conversation.  This has the
 *   sender's key rather than the inner envelope because we are depending on
 *   the fanout server to truthfully tell us which depends on it doing the
 *   boxing to us.
 * }
 *
 * @typedef[ConversationEnvelopePayload @dict[
 *   @key[body ConversationBodyEncrypted]
 * ]]{
 *   The conversation envelope is encrypted with the conversation's envelope
 *   (symmetric) secret key using the nonce providing in one the containing
 *   objects.
 * }
 *
 * @typedef[ConversationBodyPayload @dict[
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
 * @typedef[ConversationBodyEncrypted @naclSecretBoxed[ConversationBodySigned]]{
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



exports.createNewConversation = function(starterKeyring, serverIdentPayload) {
  // - create the new signing keypair that defines the conversation
  var convKeypair = $keyops.makeGeneralSigningKeypair();

  // - create the converation attestation
  var convAttestPayload = {
    type: "conversation",
    convId: convKeypair.publicKey,
    starter: starterKeyring.rootPublicKey,
  };

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

};

/**
 * @args[
 *   @param[authorKeyring DelegatedKeyring]
 *   @param[otherPersonIdentSigned OtherPersonIdentSigned]{
 *     The author's previously generated signature that states who the person
 *     is to us.
 *   }
 *   @param[recipPubring PersonPubring]
 * ]
 */
exports.createConversationInvitation = function(authorKeyring,
                                                otherPersonIdent,
                                                recipPubring) {
  // --- to the fanout server
  // -- for the conversation participants (not the fanout server)
  // - generate signed attestation to be sent to the list
  // - encrypt the attestation with the message key

  // -- for the fanout server itself

  // --- to the invitee
  // -- for the invitee
  // (sekret detailz about the conversation)
  // - encrypt the shared secret keys into

  // -- for their fanin server
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
