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
@typedef[UserPSTransitInnerEnvelope @extend[PSTransitInnerEnvelope
  @key[type "user"]
  @key[name UserRootPublicKey]{
    Target user's root key.
  }
  @key[payload BoxedUserToUserEnvelope]{
    Boxed message to the user.
  }
]]{
  User-to-user direct message.
}


}
@typedef[ConvMsgPSTransitInnerEnvelope @extend[PSTransitInnerEnvelope
  @key[type "convmsg"]
  @key[convId ConversationId]{
    The name of the conversation the message is to.
  }
  @key[payload BoxedConversationEnvelope]
]]{
  A human message to a conversation being relayed to the fan-out server.
}

@typedef[SSTransitEnvelope @dict[
  @key[type @oneof[
    @case["joined"]{
      Fanin-ish; the response to a "joinconv" request once it has been
      accomplished.  `payload` will be a message that our user composed to
      us as part of the invitation process but we have not previously
      seen.  Also note that this will be the first we have heard of this
      invitation, as the previous step was a direct message from our user
      to the invited user's maildrop/fanout server.  (Accordingly, the
      nonce used can be/is the same as the nonce used for the "joinconv"
      message.)  `name` names the user who issued the joinconv message by
      their tell key and who should be the author of the payload which should
      correspond to an (encrypted) `PSTransitInnerEnvelope`.
    }
    @case["initialfan"]{
      A conversation welcome message authenticated on the basis of the
      initiating user's relationship with the contact rather than
      a pre-existing per-conversation authorization (induced by a "join"
      message.)  It will include `senderKey` denoting the sender (tell key)
      for this purpose and `proof` which is the conversation id boxed by said
      sender to the transit server as proof of it being their request.
    }
    @case["fannedmsg"]{
      A conversation message.  `payload` will be a boxed message from the
      fanout server to the `name`d user.  `convId` will name the
      conversation.
    }
  ]]{
  }
  @key[name]{
    The tell public box key of the recipient user.
  }
  @key[convId]{
    The conversation this is a message for.
  }
  @key[senderKey #:optional]
  @key[proof #:optional]
  @key[nonce]
  @key[payload]
]]{
  Server-to-server transit envelope; from the fanout server on the other
  server to a user on our server.
}

@typedef[ConversationWelcomeMessage @dict[
  @key[boxedInvite]
  @key[backlog @listof[ConversationFanoutEnvelope]]
]]{
  Contains the conversation meta-data from the inviter in a boxed message
  from the inviter, plus all of the conversation backlog.
}


@typedef[ConversationEnvelope @dict[
  @key[body ConversationBodyEncrypted]
]]{
  The conversation envelope is encrypted with the conversation's envelope
  (symmetric) secret key using the nonce providing in one the containing
  objects.

  Although this block is not signed, we have a optimistically reliable
  indicator of the author of this message thanks to the enclosing
  `ConversationFanoutEnvelope` and its boxing.

  XXX This may be an unneeded level of wrapping.  We would put stuff in here
  that the participants in the conversation don't want the fan-out server
  to see in terms of envelope data.
}
@typedef[ConversationEnvelopeEncrypted
         @naclSecretBoxed[ConversationEnvelope convEnvelopeSecretKey]]

@typedef[ConversationBody @dict[
  @key[author AnnounceSignPubKey]
  @key[convId]
  @key[composedAt DateMS]{
    Composition date of the message.
  }
  @key[body String]
]]{
}

@typedef[ConversationBodySigned @naclSigned[ConversationBodyPayload author]]{
  The body signed by the author using
}

@typedef[ConversationBodyEncrypted
         @naclSecretBoxed[ConversationBodySigned convBodySecretKey]]{
}

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
