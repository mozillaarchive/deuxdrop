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
 * Defines public identity data structures.
 *
 * Note that all keys are either signing or boxing (signcryption) keys and they
 * are never used for both.
 *
 * @typedef[ServerSelfIdentPayload @dict[
 *   @key[tag]
 *   @key[host]
 *   @key[port]
 *   @key[boxPubKey]
 * ]]{
 *   Server self-idents differ from person self-idents in that the root key
 *   signs the self-ident which names the long-term boxing public key.  (Person
 *   self-idents sign the self-ident with their long-term and include the
 *   authorization for the long-term key as proof they are authorized to do so.)
 *
 *   XXX additionally, there is no validity period or generation number for the
 *   server key because we have no defense plan, attack model, or recovery plan
 *   in the event of compromise at this time.  (We are using a long-term key
 *   instead of the root key because it does seem obvious that for any recovery
 *   plan that does not involve nuking the server, we need a root key that is
 *   air-gapped from all net-accessible machines.)
 * }
 *
 * @typedef[PersonSelfIdentPayload @dict[
 *   @key[poco Object]{
 *     A portable contact blob that the identity claims is them; the only
 *     specially treated attributes are "displayName" and "nickname".
 *   }
 *
 *   @key[root @dict[
 *     @key[rootSignPubKey]{
 *       The root public key for this identity.
 *
 *       The idea is that the identity's root secret key may be protected with a
 *       much greater degree of security (ex: written in disappearing ink in pig
 *       latin on a piece of highly flammable paper that lives in a safe deposit
 *       box) than the other keys whose day-to-day usage necessarily results in
 *       a greater risk of compromise.
 *     }
 *     @key[longtermSignPubKey]{
 *       The long term public key for this identity which must be the same used
 *       to sign the `PersonSelfIdentPayload` blob.  The identity may use
 *       different keys for all other tasks.
 *     }
 *     @key[longetermSignPubAuth]{
 *       The authorization by the `rootSignPubKey` that authorizes the
 *       `longtermSignPubKey` to act on its behalf.
 *     }
 *   ]]{
 *     Root authorization to long-term keys.
 *   }
 *
 *   @key[issuedAt DateMS]{
 *     The timestamp when this identity was created / asserted valid / etc.  We
 *     are currently not dealing with validity ranges and such; this is merely a
 *     debugging stop-gap measure.
 *   }
 *
 *   @key[transitServerIdent ServerSelfIdent]{
 *     The (current) self-ident of the transit server we are using.
 *   }
 *
 *   @key[keys @dict[
 *     @key[envelopePubKey]{
 *       The public key to use to encrypt the envelope of messages to this
 *       person.  This is different from the payload key so that a user can
 *       authorize their mailstore to be able to read the envelope for
 *       processing but not let it see the payload.
 *     }
 *     @key[payloadPubKey]{
 *       The public key to use to encrypt the payload of messages to this person.
 *     }
 *
 *     @key[authorshipSignPubKey]{
 *       The public key corresponding to the secret key that will be used to sign
 *       messages authored by this identity.
 *     }
 *     @key[authorshipBoxPubKey]{
 *       The public key corresponding to the secret key that will be used to
 *       encrypt messages authored by this identity.
 *     }
 *   ]]{
 *    Keys to use to compose messages to the user and authenticate/decrypt
 *    messages sent by the user.
 *   }
 * ]]{
 *   Data structure to be self-signed by an identity that provides their
 *   (claimed) name and all the host and key info to be able to send them
 *   messages and receive messages from them.
 * }
 *
 * @tyepdef[PersonClientAuthPayload @dict[
 *   @key[clientBoxPubKey]{
 *     The public key corresponding to the secret key that will be used to
 *     establish.
 *   }
 * ]]{
 *   Authorizes and names a client and the keys it will use for contacting the
 *   server.  Gets signed by the (active) longtermSignPubKey for the identity.
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
 * Generate a server self-ident blob.
 */
exports.generateServerSelfIdent = function(rootKeypair, longtermBoxBundle,
                                           detailsObj) {
  // XXX schema-check the detailsObj
  var payloadObj = {
    tag: detailsObj.tag,
    host: detailsObj.host,
    port: detailsObj.port,
    publicKey: longtermBoxBundle.keypair.publicKey,
    rootPubKey: rootKeypair.publicKey,
  };
  return $keyops.signJsonWithRootKeypair(payloadObj, rootKeypair);
};

/**
 * Verify and return the given server self-ident if valid, throw if invalid.
 */
exports.assertGetServerSelfIdent = function(serverSelfIdent) {
  return $keyops.assertGetRootSelfSignedPayload(serverSelfIdent);
};


/**
 * @args[
 *   @param[details @dict[
 *     @key[name String]
 *     @key[suggestedNick #:optional String]
 *   ]]
 * ]
 */
exports.generatePersonSelfIdent = function(details) {
  var full = {pub: {}, secret: {}},
      pub = full.pub, secret = full.secret;

  pub.name = details.name;
  pub.suggestedNick = details.hasOwnProperty("suggestedNick") ?
                        details.suggestedNick : details.name;

  var rootSignPair = $nacl.sign_keypair();
  secret.rootSignSecKey = rootSignPair.sk;
  pub.rootSignPubKey = rootSignPair.pk;

  pub.issuedAt = secret.issuedAt = 0;

  pub.maildropDNS = details.hasOwnProperty("maildropDNS") ?
                      details.maildropDNS : null;


  pub.issuedAt = secret.issuedAt = Date.now();
};

}); // end define
