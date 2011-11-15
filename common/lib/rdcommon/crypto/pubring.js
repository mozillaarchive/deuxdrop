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
 * Public-only keyring representation; they track the known public keys and
 *  their relationships for an external entity.  This is used to hide the
 *  implementation details of authorization chains or the many many keys people
 *  can have.
 *
 * Currently this is only done for "person"s and not servers because the
 *  person key situation is (intentionally) much more complicated.
 **/

define(
  [
    'rdcommon/crypto/keyops',
    'rdcommon/identities/pubident',
    'exports'
  ],
  function(
    $keyops,
    $pubident,
    exports
  ) {

const VERSION = 1;

/**
 * Public-only keyring representation.  Although signed source material is
 *  maintained, the general operation of this class does not re-verify
 *  signatuers that by invariant must have already been verified.  This is
 *  because ECC signature verification is relatively expensive and we are
 *  assuming a data compromise could be accompanied by a code compromise; the
 *  solution is for downstream consumers in separate execution universes to
 *  verify things for themselves.
 */
function PersonPubring(persistedBlob) {
  this.data = persistedBlob;
}
exports.PersonPubring = PersonPubring;
PersonPubring.prototype = {
  toString: function() {
    return '[PersonPubring]';
  },
  toJSON: function() {
    return {
      type: 'PersonPubring',
    };
  },

  get rootPublicKey() {
    return this.data.rootPublicKey;
  },

  get transitServerPublicKey() {
    return this.data.transitServerPublicKey;
  },

  get allLongtermSigningKeys() {
    return this.data.longtermKeys;
  },

  /**
   * Assert that the longterm signing public key was valid for this person at
   *  the given timestamp, throwing an exception if the key is either unknown
   *  to us or is not valid for the given timestamp.
   *
   * The timestamp is required in all cases.  Ideally the timestamp at which
   *  something was received by a (trusted) node will be persisted with the
   *  data so we can use that timestamp to validate the data.  This avoids
   *  weird semantics where data starts expiring out from under an application
   *  in nonsensical ways.
   */
  assertValidLongtermSigningKey: function(longtermSignPubKey, timestamp) {
    // XXX we currently do not verify the timestamp stuff.
    if (this.data.longtermKeys.indexOf(longtermSignPubKey) !== -1)
      return;
    throw new $keyops.InvalidAuthorizationError();
  },

  /**
   * Get the currently active key from a given group with a given name.
   */
  getPublicKeyFor: function(groupName, keyName) {
    // XXX this is a normalizing hack whose invocation usage will likely
    //  have a timestamp available and should just stop using us as its means
    //  of getting keys, etc.  Upstream callers may also need love.
    if (groupName === 'LONGTERM' && keyName === 'LONGTERM')
      return this.data.longtermKeys[0];
    if (!this.data.activeGroups.hasOwnProperty(groupName))
      throw new Error("No such group: '" + groupName + "'");
    if (!this.data.activeGroups[groupName].hasOwnProperty(keyName))
      throw new Error("No such key: '" + keyName + "'");

    return this.data.activeGroups[groupName][keyName];
  },

  /**
   * Assert that the observed key was a valid key for the given key (name) in
   *  the given group (name).
   *
   * Care must be taken when providing timestamps to make sure that you are not
   *  allowing an attacker to choose timestamps that match the keys they have
   *  compromised.  Ideally, use the timestamp when something was observed or
   *  received.
   */
  assertValidKeyAtTime: function(observedKey, timestamp, groupName, keyName) {
    // XXX we currently just use activeGroups, not a list of stuff.
    if (!this.data.activeGroups.hasOwnProperty(groupName))
      throw new Error("No such group: '" + groupName + "'");
    if (!this.data.activeGroups[groupName].hasOwnProperty(keyName))
      throw new Error("No such key: '" + keyName + "'");

    // XXX we are not checking timestamps at all!
    if (observedKey !== this.data.activeGroups[groupName][keyName])
      throw new $keyops.InvalidAuthorizationError();
  },

  /**
   * Assert the validity of a signed blob, returning its results if valid.
   *
   * @args[
   *   @param[signedObjBlob String]{
   *     The signed object blob.
   *   }
   *   @param[observedTimestamp DateMS]{
   *     The timestamp of the first reliable instance we (or someone we trust)
   *     observed the signed blob.
   *   }
   *   @param[keyNamingField String]{
   *     The field in the signed object that names the key used to sign it.
   *   }
   *   @param[timestampNamingField #:optional String]{
   *     The field in the signed object that names the date of signing.  This
   *     is intended to be used in conjunction with the `observedTimestamp` and
   *     key validity ranges to make sure we are not dealing with backdated
   *     signatures with compromised keys, replay attacks, or other
   *     maliciousness.
   *
   *     XXX entirely speculative and unimplemented at this point.
   *   }
   *   @param[groupName]{
   *     The group name the signing key should belong to.
   *   }
   *   @param[keyName]{
   *     The key name in the group the signing key should correspond to.
   *   }
   * ]
   */
  assertGetSignedSelfNamingPayload: function(signedObjBlob,
                                             observedTimestamp,
                                             keyNamingField,
                                             timestampNamingField,
                                             groupName, keyName) {
    // XXX we do *nothing* with the timestamp stuff. *NOTHING*
    var expectedSigningKey = this.getPublicKeyFor(groupName, keyName);

    var peeked = JSON.parse(
                   $keyops.generalPeekInsideSignatureUtf8(signedObjBlob));
    var actualSigningKey = peeked[keyNamingField];
    if (expectedSigningKey !== actualSigningKey)
      throw new $keyops.KeyMismatchError();

    $keyops.generalVerifySignatureUtf8(signedObjBlob, expectedSigningKey);
    return peeked;
  },

  __persist: function() {
    return this.data;
  },
};



function commonCreatePersonPubring(selfIdentPayload, selfIdentBlob) {
  var persistedForm = {
    v: VERSION,
    sources: {
      selfIdents: [selfIdentBlob],
    },
    rootPublicKey: selfIdentPayload.root.rootSignPubKey,
    longtermKeys: [selfIdentPayload.root.longtermSignPubKey],
    activeGroups: {
      messaging: {
        envelopeBox: selfIdentPayload.keys.envelopeBoxPubKey,
        bodyBox: selfIdentPayload.keys.bodyBoxPubKey,
        announceSign: selfIdentPayload.keys.announceSignPubKey,
        tellBox: selfIdentPayload.keys.tellBoxPubKey,
      },
    },
    transitServerPublicKey: (selfIdentPayload.transitServerIdent ?
      $pubident.peekServerSelfIdentBoxingKeyNOVERIFY(
        selfIdentPayload.transitServerIdent) : null),
  };
  return new PersonPubring(persistedForm);
}

/**
 * Given a self-ident blob that has been reliably checked elsewhere, peek inside
 *  it and use its payload to initialize a pubring.
 *
 * Under no circumstances should this be used on a self-ident blob that has not
 *  been previously checked.
 */
exports.createPersonPubringFromSelfIdentDO_NOT_VERIFY = function(selfIdentBlob) {
  return commonCreatePersonPubring(
    JSON.parse($keyops.generalPeekInsideSignatureUtf8(selfIdentBlob)),
    selfIdentBlob);
};

/**
 * Given an other-person-ident blob that has been reliably checked elsewhere,
 *  peek inside it and use its payload to initialize a pubring.
 *
 * Under no circumstances should this be used on a oth-ident blob that has not
 *  been previously checked.
 */
exports.createPersonPubringFromOthIdentDO_NOT_VERIFY = function(othIdentBlob) {
  var othIdentPayload = JSON.parse($keyops.generalPeekInsideSignatureUtf8(
                                     othIdentBlob));
  var selfIdentBlob = othIdentPayload.personSelfIdent;
  var selfIdentPayload = JSON.parse($keyops.generalPeekInsideSignatureUtf8(
                                      selfIdentBlob));
  return commonCreatePersonPubring(selfIdentPayload, selfIdentBlob);
};

exports.loadPersonPubring = function(persistedForm) {
  return new PersonPubring(persistedForm);
};

}); // end define
