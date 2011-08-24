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
 * An adapted version of our unit tests for our node nacl binding.  A lot of
 *  stuff could be refactored to only work once.
 **/

var nacl = require('nacl');

var {Cc, Ci} = require('chrome');

// mimic node.js's assert.throws impl
var assert = {
  "throws": function(func, check) {
    var ex = null;
    try {
      func();
    }
    catch (_ex) {
      ex = _ex;
    }
    if (!ex)
      throw new Error("Did not throw something satisfying " + check);
    //console.log("ex check", "!", ex, "!", check, "!", typeof(check), "!");
    if (check instanceof RegExp) {
      if (!check.test(ex))
        throw new Error("Thrown exception " + ex + " does not satisfy " + check);
    }
    else {
      if (!(ex instanceof check))
        throw new Error("Thrown exception " + ex + " not an instance of " + check);
    }
  },
};

// Use a bunch of zeroes as our binary string test as they are proven to screw
//  us up in utf8 mode.
var ZEROES_8 = '\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000';
var ZEROES_16 = ZEROES_8 + ZEROES_8;
var ZEROES_64 = ZEROES_16 + ZEROES_16 + ZEROES_16 + ZEROES_16;

// Also use a stream of numbers with binary zeroes mixed in so that repetition
//  causes a failure.  (We have had a problem where bits of the string got
//  repeated, which is obviously not useful.)
var BINNONREP = '\u0000\u0001\u0002\u0003\u00004\u0000' +
                '\u0000\u0005\u0006\u0007\u00008\u0000' +
                '\u0000\u0009\u000a\u000b\u0000c\u0000' +
                '\u0000\u0011\u0012\u0013\u00014\u0000' +
                '\u0000\u0015\u0016\u0017\u00018\u0000' +
                '\u0000\u0019\u001a\u001b\u0001c\u0000' +
                '\u0000\u0021\u0022\u0023\u00024\u0000' +
                '\u0000\u0025\u0026\u0027\u00028\u0000' +
                '\u0000\u0029\u002a\u002b\u0002c\u0000'; // 54 bytes

var ALPHA_STEW = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' +
                 'abcdefghijklmnopqrstuvwxyz0123456789';

var JSON_STEW = JSON.stringify({
  a: 'b',
  c: ['d', 5, -10, {e: 'f'}],
  g: {h: 'i', j: 12},
});

var hexies = ['0', '1', '2', '3', '4', '5', '6', '7',
              '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];

// XXX if we had non-ASCII messages tested, this would screw up as it needs to
//  know whether to interpret as utf8 in that case...
function hexify(bs) {
  // XXX need hexer or base64 encoder...
  var hs = "";
  for (var i = 0; i < bs.length; i++) {
    var c = bs.charCodeAt(i);
    hs += hexies[c >> 4]  + hexies[c % 16];
  }
  return hs;
}

function corruptString(msg) {
  var indexToCorrupt = Math.floor(msg.length / 2);
  var corruptedChar =
    String.fromCharCode((3 ^ msg.charCodeAt(indexToCorrupt))&0xff);
  return msg.substring(0, indexToCorrupt) + corruptedChar +
         msg.substring(indexToCorrupt + 1);
}

exports.testCustomErrors = function(test) {
  // - make sure we exposed the types
  test.assertNotEqual(nacl.BadBoxError, undefined);
  test.assertNotEqual(nacl.BadSignatureError, undefined);
  test.assertNotEqual(nacl.BadSecretBoxError, undefined);
  test.assertNotEqual(nacl.BadAuthenticatorError, undefined);
  // - make sure they got their own distinct prototypes
  test.assertNotEqual(nacl.BadBoxError.prototype, Error.prototype);
  test.assertNotEqual(nacl.BadSignatureError.prototype, Error.prototype);
  test.assertNotEqual(nacl.BadSecretBoxError.prototype, Error.prototype);
  test.assertNotEqual(nacl.BadAuthenticatorError.prototype, Error.prototype);

  test.assertNotEqual(nacl.BadBoxError.prototype,
                nacl.BadSignatureError.prototype);
  test.assertNotEqual(nacl.BadBoxError.prototype,
                nacl.BadSecretBoxError.prototype);
  test.assertNotEqual(nacl.BadBoxError.prototype,
                nacl.BadAuthenticatorError.prototype);

  test.assertNotEqual(nacl.BadSignatureError.prototype,
                nacl.BadSecretBoxError.prototype);
  test.assertNotEqual(nacl.BadSignatureError.prototype,
                nacl.BadAuthenticatorError.prototype);

  test.assertNotEqual(nacl.BadSecretBoxError.prototype,
                nacl.BadAuthenticatorError.prototype);

  // - make sure that if we throw them that we get a stack on them
  try {
    throw new nacl.BadBoxError("just check the stack");
  }
  catch(ex) {
    test.assertNotEqual(ex.stack, null);
  }
  test.done();
};

function checkSignatureOf(message, binaryMode, test) {
  console.log("===== Planning to sign: '" + message + "' aka " +
              hexify(message));
  var signer, opener, peeker;
  if (binaryMode) {
    signer = nacl.sign;
    opener = nacl.sign_open;
    peeker = nacl.sign_peek;
  }
  else {
    signer = nacl.sign_utf8;
    opener = nacl.sign_open_utf8;
    peeker = nacl.sign_peek_utf8;
  }

  // Create public/secret keys {pk, sk}
  var keys = nacl.sign_keypair();

  console.log('SIGNATURE KEYS',
              'sk', keys.sk.length, hexify(keys.sk),
              'pk', keys.pk.length, hexify(keys.pk));

  // Sign a message with the secret key
  console.log("SIGN", message.length, message);
  var signed_message = signer(message, keys.sk);

  console.log("SIGNED", signed_message.length, hexify(signed_message));
  test.assertNotEqual(message, signed_message);

  var peeked_message = peeker(signed_message);
  console.log("PEEKED", peeked_message.length, peeked_message);
  test.assertEqual(message, peeked_message);

  // Verify the (valid) signed message.
  var checked_message = opener(signed_message, keys.pk);
  console.log("OPENED", checked_message.length, checked_message);
  test.assertEqual(message, checked_message);

  // The minimum message size is 64 bytes because of the hash and the signature,
  //  but we need to make sure we don't die with something smaller, as nacl
  //  does not guard against this and will crash us hard.
  var too_small_gibberish_signed_message = 'I am not actually signed'; // 24
  var gibberish_signed_message = '';
  while (gibberish_signed_message.length < 64)
    gibberish_signed_message += too_small_gibberish_signed_message;

  // Verify that gibberish signed messages do not pass and throw the right things
  assert.throws(function() {
    var bad_checked_message =
      opener(too_small_gibberish_signed_message, keys.pk);
  }, nacl.BadSignatureError);
  assert.throws(function() {
    var bad_checked_message =
      opener(too_small_gibberish_signed_message, keys.pk);
  }, /message is smaller than the minimum signed message size/);
  assert.throws(function() {
    var bad_checked_message = opener(gibberish_signed_message, keys.pk);
  }, nacl.BadSignatureError);
  assert.throws(function() {
    var bad_checked_message = opener(gibberish_signed_message, keys.pk);
  }, /ciphertext fails verification/);

  // Verify that a message signed with a different public key does not pass.
  var alt_keys = nacl.sign_keypair();
  var alt_signed_message = signer(message, alt_keys.sk);

  assert.throws(function() {
    var alt_checked_message = opener(alt_signed_message, keys.pk);
  }, nacl.BadSignatureError);
  assert.throws(function() {
    var alt_checked_message = opener(alt_signed_message, keys.pk);
  }, /ciphertext fails verification/);
}

/**
 * Test the signature generation and verification using freshly generated keys.
 */
exports.testSigning = function(test) {
  checkSignatureOf('Hello World!', false, test);
  checkSignatureOf(ALPHA_STEW, false, test);
  checkSignatureOf(JSON_STEW, false, test);

  checkSignatureOf(ZEROES_64, true, test);
  checkSignatureOf(BINNONREP, true, test);

  test.done();
};

function checkBoxRoundTripOf(message, binaryMode, test) {
  var boxer, unboxer;
  if (binaryMode) {
    boxer = nacl.box;
    unboxer = nacl.box_open;
  }
  else {
    boxer = nacl.box_utf8;
    unboxer = nacl.box_open_utf8;
  }

  console.log("===== Planning to encrypt: '" + message + "' aka " +
              hexify(message));
  var sender_keys = nacl.box_keypair(),
      recip_keys = nacl.box_keypair();
  console.log('B SENDER sk', sender_keys.sk.length, hexify(sender_keys.sk));
  console.log('B SENDER pk', sender_keys.pk.length, hexify(sender_keys.pk));
  console.log('B RECIP sk', recip_keys.sk.length, hexify(recip_keys.sk));
  console.log('B RECIP pk', recip_keys.pk.length, hexify(recip_keys.pk));

  // Random nonces are unlikely to collide and we are less likely to violate
  //  the requirement forbidding reusing nonces for a given sender/recip pair
  //  than we try and do it ourselves.
  var nonce = nacl.box_random_nonce();
  console.log('NONCE', hexify(nonce));

  console.log('BOX', message.length, message);
  var boxed_message = boxer(message, nonce,
                            recip_keys.pk, sender_keys.sk);
  console.log('BOXED', boxed_message.length, hexify(boxed_message));
  test.assertNotEqual(message, boxed_message);

  var unboxed_message = unboxer(boxed_message, nonce,
                                sender_keys.pk, recip_keys.sk);
  console.log('UNBOX', unboxed_message.length, unboxed_message);
  test.assertEqual(message, unboxed_message);

  // -- verify we throw the right type of errors on exception.
  // - empty ciphertext
  assert.throws(function() {
    unboxer("", nonce, sender_keys.pk, recip_keys.sk);
  }, nacl.BadBoxError);
  // - corrupt ciphertext
  assert.throws(function() {
    unboxer(corruptString(boxed_message), nonce, sender_keys.pk, recip_keys.sk);
  }, nacl.BadBoxError);
}

/**
 * Test the public-key encryption and decryption using freshly generated keys
 * and nonces.
 */
exports.testBoxing = function(test) {
  // Check that our round-trip actually works...
  checkBoxRoundTripOf('Hello World!', false, test);
  checkBoxRoundTripOf(ALPHA_STEW, false, test);
  checkBoxRoundTripOf(JSON_STEW, false, test);

  // Check that we don't break on true binary strings...
  checkBoxRoundTripOf(ZEROES_64, true, test);
  checkBoxRoundTripOf(BINNONREP, true, test);

  // The gibberish / wrong keys thing does not make a lot of sense in the
  //  encryption case, so we don't bother.

  test.done();
};

function checkSecretBoxRoundTripOf(message, binaryMode, test) {
  var boxer, unboxer;
  if (binaryMode) {
    boxer = nacl.secretbox;
    unboxer = nacl.secretbox_open;
  }
  else {
    boxer = nacl.secretbox_utf8;
    unboxer = nacl.secretbox_open_utf8;
  }

  console.log("===== Planning to encrypt: '" + message + "' aka " +
              hexify(message));

  var key = nacl.secretbox_random_key();
  console.log('KEY', hexify(key));
  var nonce = nacl.secretbox_random_nonce();
  console.log('NONCE', hexify(nonce));

  console.log('SBOX', message.length, message);
  var boxed_message = boxer(message, nonce, key);

  console.log('SBOXED', boxed_message.length, hexify(boxed_message));
  test.assertNotEqual(message, boxed_message);

  var unboxed_message = unboxer(boxed_message, nonce, key);
  console.log('SUNBOX', unboxed_message.length, unboxed_message);
  test.assertEqual(message, unboxed_message);

  // -- verify we throw the right type of errors on exception.
  // - empty ciphertext
  assert.throws(function() {
    unboxer("", nonce, key);
  }, nacl.BadSecretBoxError);
  // - corrupt ciphertext
  assert.throws(function() {
    unboxer(corruptString(boxed_message), nonce, key);
  }, nacl.BadSecretBoxError);
}

exports.testSecretBoxing = function(test) {
  checkSecretBoxRoundTripOf('Hello World!', false, test);
  checkSecretBoxRoundTripOf(ALPHA_STEW, false, test);
  checkSecretBoxRoundTripOf(JSON_STEW, false, test);

  checkSecretBoxRoundTripOf(ZEROES_64, true, test);
  checkSecretBoxRoundTripOf(BINNONREP, true, test);

  test.done();
};

function checkAuthenticatorFor(message, binaryMode, test) {
  var auther, verifier;
  if (binaryMode) {
    auther = nacl.auth;
    verifier = nacl.auth_verify;
  }
  else {
    auther = nacl.auth_utf8;
    verifier = nacl.auth_verify_utf8;
  }

  console.log("===== Planning to authenticate: '" + message + "' aka " +
              hexify(message));

  var key = nacl.auth_random_key();
  console.log('KEY', hexify(key));

  console.log('AUTH', message.length, message);
  var authenticator = auther(message, key);

  console.log('AUTHED', authenticator.length, hexify(authenticator));
  // this would be weird...
  test.assertNotEqual(message, authenticator);

  verifier(authenticator, message, key); // (throws)

  // -- verify we throw the right type of errors on exception.
  // - empty authenticator
  assert.throws(function() {
    verifier("", message, key);
  }, nacl.BadAuthenticatorError);
  // - empty message
  assert.throws(function() {
    verifier(authenticator, "", key);
  }, nacl.BadAuthenticatorError);
  // - corrupt authenticator
  assert.throws(function() {
    verifier(corruptString(authenticator), message, key);
  }, nacl.BadAuthenticatorError);
  // - corrupt message
  assert.throws(function() {
    verifier(authenticator, corruptString(message), key);
  }, nacl.BadAuthenticatorError);
}

exports.testAuthenticators = function(test) {
  checkAuthenticatorFor('Hello World!', false, test);
  checkAuthenticatorFor(ALPHA_STEW, false, test);
  checkAuthenticatorFor(JSON_STEW, false, test);

  checkAuthenticatorFor(ZEROES_64, true, test);
  checkAuthenticatorFor(BINNONREP, true, test);

  test.done();
};

/**
 * Make sure we expose our constants and they are correct.  The constants
 *  are accordingly hard-coded here.
 */
exports.testConstants = function(test) {
  test.assertEqual(nacl.box_PUBLICKEYBYTES, 32);
  test.assertEqual(nacl.box_SECRETKEYBYTES, 32);
  test.assertEqual(nacl.secretbox_KEYBYTES, 32);
  test.assertEqual(nacl.auth_KEYBYTES, 32);

  test.done();
};

function checkHashFor(msg, binaryMode, test) {
  var converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"]
                    .createInstance(Ci.nsIScriptableUnicodeConverter);
  // we should vary on binaryMode if/when we start doing that...
  converter.charset = "UTF-8";
  var data = converter.convertToByteArray(msg, {});

  var jetHasher = Cc["@mozilla.org/security/hash;1"]
                    .createInstance(Ci.nsICryptoHash);
  jetHasher.init(jetHasher.SHA512);
  jetHasher.update(data, data.length);
  var jetHash = jetHasher.finish(false).substring(0, 32);

  var naclHasher = binaryMode ? nacl.hash512_256 : nacl.hash512_256_utf8;

  test.assertEqual(naclHasher(msg), jetHash);
}
exports.testHash = function(test) {
  checkHashFor('Hello World!', false, test);
  checkHashFor(ALPHA_STEW, true, test);

  test.done();
};
