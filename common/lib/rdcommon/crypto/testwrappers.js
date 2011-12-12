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
 * Wrap our crypto operations for time accounting and system understanding
 *  reasons.
 **/

define(
  [
    'rdcommon/log',
    './keyops',
    'module',
    'exports'
  ],
  function(
    $log,
    $keyops,
    $module,
    exports
  ) {

// save off the original keyops state.
var keyops = {};
for (var key in $keyops) {
  keyops[key] = $keyops[key];
}

function makeKeyopsWrapper() {
  var LOG = LOGFAB.keyops(null, null, 'keyops');
  var wrapped = {};

  // -- save off the original and copy everything over by default
  for (var key in $keyops) {
    wrapped[key] = $keyops[key];
  }

  // -- clobber interesting things with wrappings
  // - keypair generation
  wrapped.generateAndAuthorizeKeyGroup = function(longtermSigningKeypair,
                                                  groupName, groupKeys) {
    LOG.keypairGeneration_begin();
    var rval = keyops.generateAndAuthorizeKeyGroup(longtermSigningKeypair,
                                                   groupName, groupKeys);
    LOG.keypairGeneration_end();
    return rval;
  };

  // - keypair authorization check
  wrapped.assertLongtermKeypairIsAuthorized = function(
                                                longtermPublicKey,
                                                boxOrSign, rootPublicKey,
                                                timestamp, signedAuth) {
    LOG.keypairAuthCheck_begin();
    var rval = keyops.assertLongtermKeypairIsAuthorized(
                 longtermPublicKey, boxOrSign, rootPublicKey,
                 timestamp, signedAuth);
    LOG.keypairAuthCheck_end();
    return rval;
  };


  // - box
  wrapped.generalBox = function(msg, nonce, recipientPubKey, keypair) {
    LOG.box_begin();
    var rval = keyops.generalBox(msg, nonce, recipientPubKey, keypair);
    LOG.box_end();
    return rval;
  };
  wrapped.generalBoxUtf8 = function(msg, nonce, recipientPubKey, keypair) {
    LOG.box_begin();
    var rval = keyops.generalBoxUtf8(msg, nonce, recipientPubKey, keypair);
    LOG.box_end();
    return rval;
  };

  wrapped.generalOpenBox = function(msg, nonce, senderPubKey, keypair) {
    LOG.openBox_begin();
    var rval = keyops.generalOpenBox(msg, nonce, senderPubKey, keypair);
    LOG.openBox_end();
    return rval;
  };
  wrapped.generalOpenBoxUtf8 = function(msg, nonce, senderPubKey, keypair) {
    LOG.openBox_begin();
    var rval = keyops.generalOpenBoxUtf8(msg, nonce, senderPubKey, keypair);
    LOG.openBox_end();
    return rval;
  };

  // - signatures
  wrapped.generalSign = function(msg, keypair) {
    LOG.sign_begin();
    var rval = keyops.generalSign(msg, keypair);
    LOG.sign_end();
    return rval;
  };
  wrapped.generalSignUtf8 = function(msg, keypair) {
    LOG.sign_begin();
    var rval = keyops.generalSignUtf8(msg, keypair);
    LOG.sign_end();
    return rval;
  };

  wrapped.generalVerifySignature = function(sm, pk) {
    LOG.verify_begin();
    var rval = keyops.generalVerifySignature(sm, pk);
    LOG.verify_end();
    return rval;
  };
  wrapped.generalVerifySignatureUtf8 = function(sm, pk) {
    LOG.verify_begin();
    var rval = keyops.generalVerifySignatureUtf8(sm, pk);
    LOG.verify_end();
    return rval;
  };

  // we do not care about peeking since it's just simple string manip


  // - secret box
  wrapped.secretBox = function(msg, nonce, key) {
    LOG.secretBox_begin();
    var rval = keyops.secretBox(msg, nonce, key);
    LOG.secretBox_end();
    return rval;
  };
  wrapped.secretBoxUtf8 = function(msg, nonce, key) {
    LOG.secretBox_begin();
    var rval = keyops.secretBoxUtf8(msg, nonce, key);
    LOG.secretBox_end();
    return rval;
  };

  wrapped.secretBoxOpen = function(ciphertext, nonce, key) {
    LOG.secretOpenBox_begin();
    var rval = keyops.secretBoxOpen(ciphertext, nonce, key);
    LOG.secretOpenBox_end();
    return rval;
  };
  wrapped.secretBoxOpenUtf8 = function(ciphertext, nonce, key) {
    LOG.secretOpenBox_begin();
    var rval = keyops.secretBoxOpenUtf8(ciphertext, nonce, key);
    LOG.secretOpenBox_end();
    return rval;
  };


  // - auth
  wrapped.auth = function(msg, key) {
    LOG.auth_begin();
    var rval = keyops.auth(msg, key);
    LOG.auth_end();
    return rval;
  };
  wrapped.authUtf8 = function(msg, key) {
    LOG.auth_begin();
    var rval = keyops.authUtf8(msg, key);
    LOG.auth_end();
    return rval;
  };

  wrapped.authVerify = function(auth, msg, key) {
    LOG.authVerify_begin();
    var rval = keyops.authVerify(auth, msg, key);
    LOG.authVerify_end();
    return rval;
  };
  wrapped.authVerifyUtf8 = function(auth, msg, key) {
    LOG.authVerify_begin();
    var rval = keyops.authVerifyUtf8(auth, msg, key);
    LOG.authVerify_end();
    return rval;
  };

  return wrapped;
}

exports.clobberKeyopsWithWrapper = function() {
  var wrapped = makeKeyopsWrapper();
  for (var key in wrapped) {
    $keyops[key] = wrapped[key];
  }
};

var LOGFAB = exports.LOGFAB = $log.register($module, {
  keyops: {
    type: $log.CRYPTO,
    topBilling: false,

    LAYER_MAPPING: {
      layer: 'crypto',
    },

    asyncJobs: {
      // - higher level primitives we provide
      keypairGeneration: {},
      keypairAuthCheck: {},

      // - basically just nacl ops with minor safety wrapping
      box: {},
      openBox: {},

      sign: {},
      verify: {},

      secretBox: {},
      secretOpenBox: {},

      auth: {},
      authVerify: {},
    },
  },
});


}); // end define
