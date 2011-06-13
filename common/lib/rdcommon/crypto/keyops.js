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
    TAG_LONGTERM_BOX = "longterm:box";

var AUTH_TAG_LONGTERM_SIGN = "longterm:sign",
    AUTH_TAG_LONGTERM_BOX = "longterm:box";

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
var MAX_AUTH_BACKDATING = 0;

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
    throw new Error("Attempting to use a non-root key to generate long " +
                    "term keys");
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
  var auth = JSON.decode(jsonAuth);
  if (auth.authorizedKey !== longtermPublicKey)
    throw new Error("Authorization is not for the provided long-term key.");
  if ((auth.authEnds < auth.authStarts) ||
      (auth.authEnds - auth.authStarts > MAX_AUTH_TIMESPAN))
    throw new Error("Authorization is gibberish.");
  if (auth.authorizedFor !== isBox ? AUTH_TAG_LONGTERM_BOX
                                   : AUTH_TAG_LONGTERM_SIGN)
    throw new Error("Authorization is not for a long-term key!");
  if (timestamp < auth.authStarts)
    throw new Error("Timestamp is earlier than the authorized time range.");
  if (timestamp > auth.authEnds)
    throw new Error("Timestamp is later than the authorized time range.");
};

/**
 * Deprecated test-only keypair generation.
 */
exports.generateServerKeypair = function() {
  var rawPair = $nacl.box_keypair();
  return {
    secretKey: rawPair.sk,
    publicKey: rawPair.pk,
  };
};

exports.signJsonWithRootKeypair = function(obj, rootKeypair) {
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
  var rootPubKey = peekedObj.rootPubKey;

  var validJsonStr = $nacl.sign_open_utf8(signedStr, rootPubKey); // (throws)
  return peekedObj;
};

}); // end define
