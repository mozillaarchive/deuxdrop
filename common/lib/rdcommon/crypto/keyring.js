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
 * Management for (private) crypto keys.  Ideally, all (non-ephemeral) private
 *  key handling associated with people goes through here so we can avoid
 *  passing private keys around or exposing them at all.  The kind of deal where
 *  we could support hardware that allows us to use the keys in operations
 *  without ever being able to directly get at the key.
 *
 * This module is just trying to structure things sanely; all crypto ops still
 *  happen in `keyops.js`.
 *
 * NOTE: We are not currently trying to defend against rogue code in the same
 *  sandbox as us.  We are not using lexical closures to hide variables, etc.
 **/

define(
  [
    './keyops',
    'exports'
  ],
  function(
    $keyops,
    exports
  ) {

exports.RINGAUTH_ROOT = 'root';
/**
 * A keyring with a longterm authorized key for an identity.
 */
exports.RINGAUTH_LONGTERM = 'longterm';
/**
 * A keyring with some delegated authority from an identity.
 */
exports.RINGAUTH_DELEGATED = 'delegated';

const VERSION = 1;

/**
 * A keyring for people with the root private keys for an identity.
 *
 * It issues and remembers longterm keyrings, but can't do anything else.
 */
function PersonRootSigningKeyring(persistedForm) {
  if (persistedForm == null) {
    this.data = {
      v: VERSION,
      rootKeypair: $keyops.generateRootSigningKeypair(),
      issuedLongtermSigners: [],
    };
  }
  else {
    this.data = persistedForm;
  }
}
PersonRootSigningKeyring.prototype = {
  get rootPublicKey() {
    return this.data.rootKeypair.publicKey;
  },

  issueLongtermSigningKeyring: function() {
    var now = Date.now();
    var longtermSignBundle = $keyops.generateAndAuthorizeLongtermKeypair(
                               this.data.rootKeypair, 'sign',
                               now, now + $keyops.MAX_AUTH_TIMESPAN);
    this.data.issuedLongtermSigners.push(longtermSignBundle);
    return new LongtermSigningKeyring(
      null,
      {
        rootPublicKey: this.rootPublicKey,
        longtermSignBundle: longtermSignBundle,
      });
  },
};

/**
 * A keyring for people with the root private keys for an identity.
 *
 * It issues and remembers longterm keyrings, but can't do anything else.
 */
function ServerRootSigningKeyring(persistedForm) {
  if (persistedForm == null) {
    this.data = {
      v: VERSION,
      rootKeypair: $keyops.generateRootSigningKeypair(),
      issuedLongtermBoxers: [],
    };
  }
  else {
    this.data = persistedForm;
  }
}
ServerRootSigningKeyring.prototype = {
  get rootPublicKey() {
    return this.data.rootKeypair.publicKey;
  },

  issueLongtermBoxingKeyring: function() {
    var now = Date.now();
    var longtermBoxBundle = $keyops.generateAndAuthorizeLongtermKeypair(
                              this.data.rootKeypair, 'box',
                              now, now + $keyops.MAX_AUTH_TIMESPAN);
    this.data.issuedLongtermBoxers.push(longtermBoxBundle);
    return new LongtermBoxingKeyring(
      null,
      {
        rootPublicKey: this.rootPublicKey,
        longtermBoxBundle: longtermBoxBundle,
      });
  },

  signJsonObj: function(obj) {
    return $keyops.signJsonWithRootKeypair(obj, this.data.rootKeypair);
  },
};


function LongtermBoxingKeyring(persistedForm, creationForm) {
  if (persistedForm == null) {
    if (!creationForm)
      throw new Error("Where is my creationForm?");

    this.data = {
      v: VERSION,
      rootPublicKey: creationForm.rootPublicKey,
      longtermBoxBundle: creationForm.longtermBoxBundle,
    };
  }
  else {
    throw new Error("XXX persisted support notyetimplemented");
  }
}
LongtermBoxingKeyring.prototype = {
  get rootPublicKey() {
    return this.data.rootPublicKey;
  },
  get boxingPublicKey() {
    return this.data.longtermBoxBundle.keypair.publicKey;
  },

  box: function(msg, nonce, recipientPubKey) {
    return $keyops.longtermBox(msg, nonce, recipientPubKey,
                               this.data.longtermBoxBundle.keypair);
  },
  boxUtf8: function(msg, nonce, recipientPubKey) {
    return $keyops.longtermBoxUtf8(msg, nonce, recipientPubKey,
                                   this.data.longtermBoxBundle.keypair);
  },
  openBox: function(boxedMessage, nonce, senderPubKey) {
    return $keyops.longtermOpenBox(boxedMessage, nonce, senderPubKey,
                                   this.data.longtermBoxBundle.keypair);
  },
  openBoxUtf8: function(boxedMessage, nonce, senderPubKey) {
    return $keyops.longtermOpenBoxUtf8(boxedMessage, nonce, senderPubKey,
                                       this.data.longtermBoxBundle.keypair);
  },
};

/**
 * A keyring with a longterm authorized key.
 *
 * It is able to issue groups of delegate-authorized keys for use by a
 *  delegated keyring.  All activites with the issued keys need to happen on a
 *  `DelegatedKeyring` and are not provided on this class.  The rationale is
 *  that the longterm key is particularly important and so should be handled
 *  separately for hygiene reasons.
 */
function LongtermSigningKeyring(persistedForm, creationForm) {
  if (persistedForm == null) {
    if (!creationForm)
      throw new Error("Where is my creationForm?");

    this.data = {
      v: VERSION,
      rootPublicKey: creationForm.rootPublicKey,
      longtermSignBundle: creationForm.longtermSignBundle,
      issuedGroups: {},
    };
  }
  else {
    throw new Error("XXX persisted support notyetimplemented");
  }
}
LongtermSigningKeyring.prototype = {
  get rootPublicKey() {
    return this.data.rootPublicKey;
  },

  /**
   * Create one or more keys (either boxing or signing) as part of a key group
   *  that will be authorized (via longterm key signature) as an atomic group.
   *
   * We will generate and persist a signature that proves we authorized these
   *  keys.  This is primarily done for parties controlled by or acting on the
   *  behalf of the user (including our own sanity-checking of our persisted
   *  store.  We expect to generate a different signature for public
   *  consumption.
   */
  issueKeyGroup: function(groupName, keyNamesToTypesMap) {
    var groupBundle = $keyops.generateAndAuthorizeKeyGroup(
      this.data.longtermSignBundle.keypair,
      groupName, keyNamesToTypesMap);

    var issuedGroups = this.data.issuedGroups;
    if (!issuedGroups.hasOwnProperty(groupName))
      issuedGroups[groupName] = [];
    issuedGroups[groupName].push(groupBundle);

    return groupBundle;
  },

  makeDelegatedKeyring: function() {
    return new DelegatedKeyring(
      null,
      {
        v: VERSION,
        rootPublicKey: this.rootPublicKey,
        longtermSignPublicKey: this.data.longtermSignBundle.keypair.publicKey,
      });
  },
};

/**
 * A keyring with a bunch of delegated keys, all of which are held on behalf of
 *  a single identity.  This mainly entails posessing one or more groups of
 *  keys which include the keypairs and the group authorization of the keys
 *  signed by a valid longterm keypair for the identity.
 */
function DelegatedKeyring(persistedForm, creationForm) {
  if (persistedForm == null) {
    if (!creationForm)
      throw new Error("Where is my creationForm?");

    this.data = {
      v: VERSION,
      rootPublicKey: creationForm.rootPublicKey,
      longtermSignPublicKey: creationForm.longtermSignPublicKey,
      // it seems to me that we should only ever be using one instance of a group
      //  at a time, but that we might know about previous generations or other
      //  sets...
      activeGroups: {},
    };
  }
  else {
    throw new Error("XXX persisted support notyetimplemented");
  }
}
DelegatedKeyring.prototype = {
  get rootPublicKey() {
    return this.data.rootPublicKey;
  },
  get signingPublicKey() {
    return this.data.longtermSignPublicKey;
  },

  _gimmeKeypair: function(groupName, keyName) {
    if (!this.data.activeGroups.hasOwnProperty(groupName))
      throw new Error("No such group: '" + groupName + "'");
    var bundle = this.data.activeGroups[groupName];
    if (!bundle.keypairs.hasOwnProperty(keyName))
      throw new Error("No such key name: '" + keyName + "'");

    return bundle.keypairs[keyName];
  },

  //////////////////////////////////////////////////////////////////////////////
  // Keyring key management

  incorporateKeyGroup: function(groupBundle) {
    this.data.activeGroups[groupBundle.groupName] = groupBundle;
  },

  //////////////////////////////////////////////////////////////////////////////
  // Signature Operations
  //
  // note that verification does not need a private key, and so is not covered
  //  here, although we may change that up.

  signWith: function(msg, groupName, keyName) {
    return $keyops.generalSign(msg, this._gimmeKeypair(groupName, keyName));
  },

  signUtf8With: function(msg, groupName, keyName) {
    return $keyops.generalSignUtf8(msg, this._gimmeKeypair(groupName, keyName));
  },

  //////////////////////////////////////////////////////////////////////////////
  // Box Operations


  boxWith: function(msg, nonce, recipientKey,
                    groupName, keyName) {
    return $keyops.generalBox(msg, nonce, recipientKey,
                              this._gimmeKeypair(groupName, keyName));
  },
  boxUtf8With: function(msg, nonce, recipientKey,
                        groupName, keyName) {
    return $keyops.generalBoxUtf8(msg, nonce, recipientKey,
                                  this._gimmeKeypair(groupName, keyName));
  },

  openBoxWith: function(boxedMessage, nonce, senderKey,
                        groupName, keyName) {
    return $keyops.generalOpenBox(boxedMessage, nonce, senderKey,
                                  this._gimmeKeypair(groupName, keyName));
  },
  openBoxUtf8With: function(boxedMessage, nonce, senderKey,
                        groupName, keyName) {
    return $keyops.generalOpenBoxUtf8(boxedMessage, nonce, senderKey,
                                      this._gimmeKeypair(groupName, keyName));
  },

  //////////////////////////////////////////////////////////////////////////////
  // Convenience Helpers

  /**
   * Expose a specific keypair as a simple boxing keyring with box/openBox
   *  variants.
   */
  exposeSimpleBoxingKeyringFor: function(groupName, keyName) {
    return new ExposedSimpleBoxingKeyring(
      this.rootPublicKey, this._gimmeKeypair(groupName, keyName));
  },

  //////////////////////////////////////////////////////////////////////////////
};

function ExposedSimpleBoxingKeyring(rootPublicKey, keypair) {
  this.rootPublicKey = rootPublicKey;
  this._keypair = keypair;
}
ExposedSimpleBoxingKeyring.prototype = {
  get boxingPublicKey() {
    return this._keypair.publicKey;
  },

  box: function(msg, nonce, recipientPubKey) {
    return $keyops.generalBox(msg, nonce, recipientPubKey, this._keypair);
  },
  boxUtf8: function(msg, nonce, recipientPubKey) {
    return $keyops.generalBoxUtf8(msg, nonce, recipientPubKey, this._keypair);
  },
  openBox: function(boxedMessage, nonce, senderPubKey) {
    return $keyops.generalOpenBox(boxedMessage, nonce, senderPubKey,
                                  this._keypair);
  },
  openBoxUtf8: function(boxedMessage, nonce, senderPubKey) {
    return $keyops.generalOpenBoxUtf8(boxedMessage, nonce, senderPubKey,
                                      this._keypair);
  },
};

/**
 * Create a completely new person identity with its own keyring.
 */
exports.createNewPersonRootKeyring = function() {
  return new PersonRootSigningKeyring();
};

/**
 * Load a keyring associated with a person's identity from its persisted blob
 *  form.
 */
exports.loadPersonKeyringFromPersistedBlob = function() {
};

exports.createNewServerRootKeyring = function() {
  return new ServerRootSigningKeyring();
};

}); // end define
