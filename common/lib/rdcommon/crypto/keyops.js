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
 * Provides low level crypto key operation support.  We should be the only
 *  place in the system where non-ephemeral keys are generated or used by
 *  directly interacting with the djb nacl layer.
 *
 * Our operations exist a higher level than the nacl layer and include tagging
 *  so that we can quickly and loudly fail if a key is passed to us that is of a
 *  different type than should be used for the requested operation.  For
 *  example, root signing keys should only ever be used to authorize long-term
 *  keys for specific roles and never for anything else.
 *
 * All verification functions come in two variations and should be consistently
 *  named along these lines:
 * - assertBlah, assertGetBlah: Throw an exception if the cryptographic test
 *    does not pass.  Return values are only used to convey information about
 *    the valid cryptographic data.  Code should preferably be structured so
 *    that a higher-level construct (like our Task abstraction) will catch the
 *    error, fail the task, and ignore the message being processed as malformed
 *    while generating appropriate log entries.  The lower level nacl primitives
 *    already operate this way; failure is only indicated by throwing
 *    exceptions.
 *
 * ## Fundamental key operations
 * - Generate a root key.  This provides the canonical identifying public
 *    signing key for a person or a server.
 * - Generate long term keys.  These are keys authorized by a root key to act
 *    with its authority in daily usage for some purpose.  They exist so that
 *    the root key can be stored somewhere safe and so it's not entirely fatal
 *    if the long term keys are compromised.
 * - Generate attestations of some fact/authorization for some other key to
 *    have some specific privilege for some time period, etc.  The desired
 *    eventual semantics/functionality are those provided by SDSI-become-SPKI.
 *
 * - Box/open.  THIS IS NOT A TRAPDOOR MECHANISM.  If Alice boxes a payload for
 *    Bob, the result is *identical* if Bob boxes the same payload for Alice
 *    using the same nonce.  This means that as long as Alice knows what she
 *    boxed, she can conclude that Bob must have boxed anything she did not box.
 *    This makes things repudiable because Bob can't prove Alice wrote
 *    something.  The flip-side is that if Alice doesn't remember what she
 *    wrote, she can't tell things apart either!
 * - Sign/verify.  This is a true public-key signature system.  It's much
 *    slower than boxes.
 * - Auth/verify.  Secret-key-based authentication/verification.
 * - Secretbox/open.  Secret-key-based authenticated encryption.
 *
 * WE HAVE NO SIGNCRYPTION PRIMITIVE.
 *
 * ## Performance numbers
 * On my machine (using microtime a uS-resolution timer):
 *
 * - Boxing is ~44 times faster than signing 1k of data.
 * - Unboxing is ~115 times faster than verifying 1k of data.
 *
 * - Generating boxing keypairs: 0.1 ms
 * - Boxing 1k of data: ~0.1 ms
 * - Unboxing 1k of data ~0.1 ms
 *
 * - Generating signing keypairs: ~4.4ms
 * - Signing 1k of data: 4.4 ms
 * - Verifying 1k of data: 11.5 ms
 *
 * Note that box operations can also be potentially further optimized using the
 *  C precomputation interface.  So, in summary, boxing is stupid fast,
 *  signatures are comparably slow, verifying them even more so.
 *
 * Also note that the nacl signing operations are not especially optimized, so
 *  if the library is updated, they could get much faster.
 *
 * In comparison (again, on my machine) openssl speed concludes:
 * - RSA 2048 bit signature: ~1.61 ms
 * - RSA 2048 bit verification: ~0.05 ms
 * - RSA 4096 bit signature: ~11.38 ms
 * - RSA 4096 bit verification: ~0.19 ms
 **/

define(
  [
    'nacl',
    'exports'
  ],
  function(
    $nacl,
    exports
  ) {

// Our tags are intended to be persistable/roundtrippable through JSON.
/**
 * Identifies a keypair as a root keypair.
 */
var TAG_ROOT_SIGN = "root:sign",
    TAG_LONGTERM_SIGN = "longterm:sign",
    TAG_LONGTERM_BOX = "longterm:box",
    TAG_GENERAL_SIGN = "general:sign",
    TAG_GENERAL_BOX = "general:box";


var AUTH_TAG_LONGTERM_SIGN = "longterm:sign",
    AUTH_TAG_LONGTERM_BOX = "longterm:box";

var BadBoxError = exports.BadBoxError = $nacl.BadBoxError;
var BadSignatureError = exports.BadSignatureError = $nacl.BadSignatureError;

var SecretKeyMisuseError = exports.SecretKeyMisuseError =
    function SecretKeyMisuseError(msg) {
  Error.captureStackTrace(this, SecretKeyMisuseError);
  this.message = msg;
};
SecretKeyMisuseError.prototype = {
  __proto__: Error.prototype,
  name: 'SecretKeyMisuseError',
};

var SelfIdentKeyMismatchError = exports.SelfIdentKeyMismatchError =
    function SelfIdentKeyMismatchError(msg) {
  Error.captureStackTrace(this, SelfIdentKeyMismatchError);
  this.message = msg;
};
SelfIdentKeyMismatchError.prototype = {
  __proto__: Error.prototype,
  name: 'SelfIdentKeyMismatchError',
};

var KeyMismatchError = exports.KeyMismatchError =
    function KeyMismatchError(msg) {
  Error.captureStackTrace(this, KeyMismatchError);
  this.message = msg;
};
KeyMismatchError.prototype = {
  __proto__: Error.prototype,
  name: 'KeyMismatchError',
};

/**
 * Superclass for authorization errors; usually something more specific should
 *  be used.
 */
var InvalidAuthorizationError = exports.InvalidAuthorizationError =
    function InvalidAuthorizationError(msg) {
  Error.captureStackTrace(this, InvalidAuthorizationError);
  this.message = msg;
};
InvalidAuthorizationError.prototype = {
  __proto__: Error.prototype,
  name: 'InvalidAuthorizationError',
};

/**
 * The authorization in question was never valid; it could be gibberish or
 *  just be signed with a key that never had any power.
 */
var NeverValidAuthorizationError = exports.NeverValidAuthorizationError =
    function NeverValidAuthorizationError(msg) {
  Error.captureStackTrace(this, NeverValidAuthorizationError);
  this.message = msg;
};
NeverValidAuthorizationError.prototype = {
  __proto__: InvalidAuthorizationError.prototype,
  name: 'NeverValidAuthorizationError',
};

/**
 * The authorization in question is not good for the requested timestamp, but
 *  appears to be a legitimate authorization.
 */
var TimestampNotInRangeAuthorizationError =
  exports.TimestampNotInRangeAuthorizationError =
    function TimestampNotInRangeAuthorizationError(msg) {
  Error.captureStackTrace(this, TimestampNotInRangeAuthorizationError);
  this.message = msg;
};
TimestampNotInRangeAuthorizationError.prototype = {
  __proto__: InvalidAuthorizationError.prototype,
  name: 'TimestampNotInRangeAuthorizationError',
};

/**
 * Generate a root signing keypair.
 */
exports.generateRootSigningKeypair = function() {
  var rawPair = $nacl.sign_keypair();
  return {
    tag: TAG_ROOT_SIGN,
    secretKey: rawPair.sk,
    publicKey: rawPair.pk,
  };
};

const MS_DAY = 1000 * 60 * 60 * 24,
      MS_YEAR = MS_DAY * 365; // XXX obviously too fuzzy; need calendar calcs
var MAX_AUTH_TIMESPAN = exports.MAX_AUTH_TIMESPAN = MS_YEAR * 2;
var MAX_FUTURE_AUTH_START = MS_YEAR * 4;
// It would be reasonable to allow backdating to avoid leaking information by
//  virtue of when the auth is created, except for the bit where we embed the
//  timestamp of when we created the auth, making that moot.
// We do, however, need to give our caller a little bit of time to call us...
var MAX_AUTH_BACKDATING = 3000;

const CANON_BOX = 'box', CANON_SIGN = 'sign';

function boxOrSignToIsBox(boxOrSign) {
  if (boxOrSign === CANON_BOX)
    return true;
  else if (boxOrSign === CANON_SIGN)
    return false;
  else
    throw new Error("boxOrSign must be one of 'box', 'sign'");
}

/**
 * Generate and authorize a long-term key for the given time span.
 */
exports.generateAndAuthorizeLongtermKeypair = function(rootKeypair,
                                                       boxOrSign,
                                                       effectiveStart,
                                                       effectiveEnd) {
  var isBox = boxOrSignToIsBox(boxOrSign);
  if (rootKeypair.tag !== TAG_ROOT_SIGN)
    throw new SecretKeyMisuseError(
      "Attempting to use a non-root key to generate long term keys");
  var now = Date.now();

  if (typeof(effectiveStart) !== "number" ||
      typeof(effectiveEnd) !== "number")
    throw new Error("effectiveStart and effectiveEnd must be timestamps");
  if (effectiveEnd < effectiveStart)
    throw new Error("effectiveEnd must be later than effectiveStart");
  if (effectiveStart + MAX_AUTH_BACKDATING < now)
    throw new Error("effectiveStart is backdated too much");
  if (effectiveEnd - effectiveStart > MAX_AUTH_TIMESPAN)
    throw new Error("authorization duration is too long");
  if (effectiveStart - now > MAX_FUTURE_AUTH_START)
    throw new Error("authorization starts too far in the future");

  var rawPair = isBox ? $nacl.box_keypair() : $nacl.sign_keypair();
  // The authorization does not name the root key it is for to avoid bugs where
  //  checking logic allows a valid authorization by a different root to be
  //  used for a different root.
  var rawAuth = {
    issuedAt: now,
    authStarts: effectiveStart,
    authEnds: effectiveEnd,
    authorizedFor: isBox ? AUTH_TAG_LONGTERM_BOX : AUTH_TAG_LONGTERM_SIGN,
    authorizedKey: rawPair.pk,
    canDelegate: false,
  };
  var jsonAuth = JSON.stringify(rawAuth);
  var signedAuth = $nacl.sign_utf8(jsonAuth, rootKeypair.secretKey);

  return {
    keypair: {
      tag: isBox ? TAG_LONGTERM_BOX : TAG_LONGTERM_SIGN,
      secretKey: rawPair.sk,
      publicKey: rawPair.pk
    },
    authorization: signedAuth,
  };
};

/**
 * Verify that a long-term public key is authorized for the given point in time
 *  given the root public key and its signed authorization.
 */
exports.assertLongtermKeypairIsAuthorized = function(longtermPublicKey,
                                                     boxOrSign,
                                                     rootPublicKey,
                                                     timestamp, signedAuth) {
  var isBox = boxOrSignToIsBox(boxOrSign);
  var jsonAuth = $nacl.sign_open_utf8(signedAuth, rootPublicKey); // (throws)
  var auth = JSON.parse(jsonAuth);
  if (auth.authorizedKey !== longtermPublicKey)
    throw new NeverValidAuthorizationError(
      "Authorization is not for the provided long-term key.");
  if ((typeof(auth.authStarts) !== "number") ||
      (typeof(auth.authEnds) !== "number") ||
      (auth.authEnds < auth.authStarts) ||
      (auth.authEnds - auth.authStarts > MAX_AUTH_TIMESPAN))
    throw new NeverValidAuthorizationError(
      "Authorization time interval is gibberish.");
  if (auth.authorizedFor !== (isBox ? AUTH_TAG_LONGTERM_BOX
                                    : AUTH_TAG_LONGTERM_SIGN))
    throw new NeverValidAuthorizationError(
      "Authorization (" + auth.authorizedFor + ") is not for a long-term key!");
  if (timestamp < auth.authStarts)
    throw new TimestampNotInRangeAuthorizationError(
      "Timestamp is earlier than the authorized time range.");
  if (timestamp > auth.authEnds)
    throw new TimestampNotInRangeAuthorizationError(
      "Timestamp is later than the authorized time range.");
};

exports.longtermBox = function(msg, nonce, recipientPubKey, keypair) {
  if (keypair.tag !== TAG_LONGTERM_BOX)
    throw new SecretKeyMisuseError(
      "Attempting to use a non-longterm key as one.");
  return $nacl.box(msg, nonce, recipientPubKey, keypair.secretKey);
};

exports.longtermBoxUtf8 = function(msg, nonce, recipientPubKey, keypair) {
  if (keypair.tag !== TAG_LONGTERM_BOX)
    throw new SecretKeyMisuseError(
      "Attempting to use a non-longterm key as one.");
  return $nacl.box_utf8(msg, nonce, recipientPubKey, keypair.secretKey);
};

exports.longtermOpenBox = function(msg, nonce, senderPubKey, keypair) {
  if (keypair.tag !== TAG_LONGTERM_BOX)
    throw new SecretKeyMisuseError(
      "Attempting to use a non-longterm key as one.");
  return $nacl.box_open(msg, nonce, senderPubKey, keypair.secretKey);
};

exports.longtermOpenBoxUtf8 = function(msg, nonce, senderPubKey, keypair) {
  if (keypair.tag !== TAG_LONGTERM_BOX)
    throw new SecretKeyMisuseError(
      "Attempting to use a non-longterm key as one.");
  return $nacl.box_open_utf8(msg, nonce, senderPubKey, keypair.secretKey);
};


/**
 * Sign an object (that we convert into a JSON string for you) with a root
 *  keypair.
 */
exports.signJsonWithRootKeypair = function(obj, rootKeypair) {
  if (rootKeypair.tag !== TAG_ROOT_SIGN)
    throw new SecretKeyMisuseError(
      "Attempting to use a non-root key as a root key!");

  var jsonObj = JSON.stringify(obj);
  return $nacl.sign_utf8(jsonObj, rootKeypair.secretKey);
};

/**
 * Verify that a JSON blob is signed by the key found in its 'rootPubKey'
 *  attribute.  This function should *only* be used for cases where you do not
 *  already know the root/identity key contained in the blob and this serves
 *  as your introduction to it OR you do not care what the identity is (because
 *  this is a self-ident that is contained by a greater attestation.)
 */
exports.assertGetRootSelfSignedPayload = function(signedStr) {
  var peekedJsonStr = $nacl.sign_peek_utf8(signedStr); // (throws)
  var peekedObj = JSON.parse(peekedJsonStr); // (throws)
  var rootPublicKey = peekedObj.rootPublicKey;

  var validJsonStr = $nacl.sign_open_utf8(signedStr, rootPublicKey); // (throws)
  return peekedObj;
};

/**
 * Create a general boxing keypair that is appropriately tagged.
 */
function makeGeneralBoxingKeypair() {
  var rawPair = $nacl.box_keypair();
  return {
    tag: TAG_GENERAL_BOX,
    secretKey: rawPair.sk,
    publicKey: rawPair.pk,
  };
};

/**
 * Create a general signing keypair that is appropriately tagged.
 */
function makeGeneralSigningKeypair() {
  var rawPair = $nacl.sign_keypair();
  return {
    tag: TAG_GENERAL_SIGN,
    secretKey: rawPair.sk,
    publicKey: rawPair.pk,
  };
};
exports.makeGeneralSigningKeypair = makeGeneralSigningKeypair;

/**
 * Sign an object (that we convert into a JSON string for you) with a longterm
 *  signing keypair.
 */
exports.signJsonWithLongtermKeypair = function(obj, longtermSigningKeypair) {
  if (longtermSigningKeypair.tag !== TAG_LONGTERM_SIGN)
    throw new SecretKeyMisuseError(
      "Attempting to use a non-longterm key as one!");

  var jsonObj = JSON.stringify(obj);
  return $nacl.sign_utf8(jsonObj, longtermSigningKeypair.secretKey);
};


/**
 * See `LongtermSigningKeyRing.issueKeyGroup`.  The authorization is for
 *  internal sanity checking and is not to be exposed to the world or
 *  accepted as a credential from the world.
 */
exports.generateAndAuthorizeKeyGroup = function(longtermSigningKeypair,
                                                groupName, groupKeys) {
  var now = Date.now();

  // - create the keypairs
  var keypairs = {}, pubkeys = {};
  for (var keyName in groupKeys) {
    var isBox = boxOrSignToIsBox(groupKeys[keyName]);
    var useName = keyName + (isBox ? "Box" : "Sign");
    var keypair = keypairs[useName] = isBox ? makeGeneralBoxingKeypair()
                                            : makeGeneralSigningKeypair();
    pubkeys[useName] = keypair.publicKey;
  }

  // - generate the authorization
  // the authorization is only over the public keys, of course...
  var rawAuth = {
    issuedAt: now,
    groupName: groupName,
    publicKeys: pubkeys,
  };
  var signedAuth = exports.signJsonWithLongtermKeypair(rawAuth,
                                                       longtermSigningKeypair);

  return {
    groupName: groupName,
    keypairs: keypairs,
    authorization: signedAuth,
    publicAuth: null,
  };
};

/**
 * Public attestation generation.  Patterned after our long-term key
 *  attestation, but this needs to be refactored into the SDSI/SPKI model.
 */
exports.generateLongtermBaseKeyAttestation = function(longtermSigningKeypair,
                                                      authorizedFor,
                                                      authorizedKey) {
  var now = Date.now();
  var rawAuth = {
    issuedAt: now,
    authStarts: now,
    authEnds: null, // as long as the long-term key is authorized.
    authorizedFor: authorizedFor,
    authorizedKey: authorizedKey,
    authorizedBy: longtermSigningKeypair.publicKey,
    canDelegate: false
  };
  return exports.signJsonWithLongtermKeypair(rawAuth,
                                             longtermSigningKeypair);
};

/**
 * Attestation verification that a key was authorized by one of a set of
 *  provided keys.  This likely needs to change when we SDSI/SPKI refactor.
 *
 * One nice but vaguely useless aspect of the current strategy is that by
 *  explicitly constraining the authorized (long-term) keys to a set, we could
 *  more easily distinguish between uncompromised long-term keys still doing
 *  stuff versus new-bad keys issued by a compromised root key.
 *
 * XXX we are not checking authorization time intervals, etc. etc. etc.
 *  this is a serious bad one and suggests we strongly need more chain info.
 */
exports.assertCheckGetAttestation = function(attestationBlob,
                                             authorizedFor,
                                             allowedKeys) {
  var peekedAuth = JSON.parse($nacl.sign_peek_utf8(attestationBlob));
  if (allowedKeys.indexOf(peekedAuth.authorizedBy) === -1)
    throw new KeyMismatchError(
      "Attestation alleged signed by unacceptable key");
  if (peekedAuth.authorizedFor !== authorizedFor)
    throw new NeverValidAuthorizationError(
      "Attestation alleged for the wrong purpose");

  $nacl.sign_open_utf8(attestationBlob, peekedAuth.authorizedBy); // (throws)
  var auth = peekedAuth;
  // (the attestation is signed by the key it says it is signed by)

  return auth;
};

exports.generalBox = function(msg, nonce, recipientPubKey, keypair) {
  if (keypair.tag !== TAG_GENERAL_BOX)
    throw new SecretKeyMisuseError(
      "Attempting to use a non-general key as one.");
  return $nacl.box(msg, nonce, recipientPubKey, keypair.secretKey);
};

exports.generalBoxUtf8 = function(msg, nonce, recipientPubKey, keypair) {
  if (keypair.tag !== TAG_GENERAL_BOX)
    throw new SecretKeyMisuseError(
      "Attempting to use a non-general key as one.");
  return $nacl.box_utf8(msg, nonce, recipientPubKey, keypair.secretKey);
};

exports.generalOpenBox = function(msg, nonce, senderPubKey, keypair) {
  if (keypair.tag !== TAG_GENERAL_BOX)
    throw new SecretKeyMisuseError(
      "Attempting to use a non-general key as one.");
  return $nacl.box_open(msg, nonce, senderPubKey, keypair.secretKey);
};

exports.generalOpenBoxUtf8 = function(msg, nonce, senderPubKey, keypair) {
  if (keypair.tag !== TAG_GENERAL_BOX)
    throw new SecretKeyMisuseError(
      "Attempting to use a non-general key as one.");
  return $nacl.box_open_utf8(msg, nonce, senderPubKey, keypair.secretKey);
};

exports.generalSign = function(msg, keypair) {
  if (keypair.tag !== TAG_GENERAL_SIGN)
    throw new SecretKeyMisuseError(
      "Attempting to use a non-general key as one.");
  return $nacl.sign(msg, keypair.secretKey);
};

exports.generalSignUtf8 = function(msg, keypair) {
  if (keypair.tag !== TAG_GENERAL_SIGN)
    throw new SecretKeyMisuseError(
      "Attempting to use a non-general key as one.");
  return $nacl.sign_utf8(msg, keypair.secretKey);
};

// Signature verification/peeking does not need any help...
exports.generalVerifySignature = $nacl.sign_open;
exports.generalVerifySignatureUtf8 = $nacl.sign_open_utf8;
exports.generalPeekInsideSignature = $nacl.sign_peek;
exports.generalPeekInsideSignatureUtf8 = $nacl.sign_peek_utf8;

exports.makeBoxNonce = $nacl.box_random_nonce;

exports.makeSecretBoxKey = $nacl.secretbox_random_key;
exports.makeSecretBoxNonce = $nacl.secretbox_random_nonce;

exports.secretBox = $nacl.secretbox;
exports.secretBoxUtf8 = $nacl.secretbox_utf8;
exports.secretBoxOpen = $nacl.secretbox_open;
exports.secretBoxOpenUtf8 = $nacl.secretbox_open_utf8;

exports.boxPublicKeyLength = nacl.box_PUBLICKEYBYTES;
exports.boxSecretKeyLength = nacl.box_SECRETKEYBYTES;
exports.secretboxKeyLength = nacl.secretbox_KEYBYTES;
exports.authKeyLength = nacl.auth_KEYBYTES;

}); // end define
