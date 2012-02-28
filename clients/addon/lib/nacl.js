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
 * Provide a jsctypes-based interface to nacl identical to our node.js bindings.
 *
 * The only real awkward part about this binding is how we handle 'binary'
 *  strings versus 'utf8' strings.  We do the exact same thing we do in node,
 *  which is to encode binary strings in JS strings just in the low order byte of
 *  the 16-bit JS character.  Because the built-in conversion functions assume
 *  8-bit strings are utf8 and both 8 and 16 bit character types assume
 *  null-terminated strings, it's on us to manually perform the transform using
 *  fromCharCode and charCodeAt.
 * (We need to convert the strings to JS strings so that they can be JSON encoded
 *  and have their length checked.)
 *
 * All exception strings contain the phrase "inexplicable" if there is no case
 *  under which the C API should return a non-zero result or where the C++
 *  wrapping at least ignores the results.
 **/

let $unload = require("unload"),
    $url = require("url"),
    $self = require("self");

let {Cc, Cu, Ci} = require("chrome");
let $ctypes_ns = {};
Cu.import("resource://gre/modules/ctypes.jsm", $ctypes_ns);
let $ctypes = $ctypes_ns.ctypes;

let numbits = $ctypes['int'].ptr.size * 8;
let platCode = numbits === 32 ? 'i686' : 'x86_64';

let runtime = Cc["@mozilla.org/xre/app-info;1"]
                .getService(Ci.nsIXULRuntime);
let platLibName;
switch (runtime.OS) {
  case 'WINNT':
    if (numbits !== 32)
      throw new Error('64-bit windows not supported right now.');
    platLibName = 'nacl-i686.dll';
    break;
  case 'Linux':
    platLibName = 'libnacl-' + platCode + '.so';
    break;
  case 'Darwin':
    if (numbits !== 64)
      throw new Error('32-bit OS X not supported right now.');
    platLibName = 'libnacl-x86_64.dylib';
    break;
  case 'Android':
    platLibName = 'libnacl-arm.so';
    break;
  default:
    throw new Error('No native library for platform: ' + runtime.OS);
}
// NOTE: the libs now get packaged in the data sub-tree!
let path = $url.toFilename(
             $self.data.url("nacl-native-libs/" + platLibName).toString());

let NACL = $ctypes.open(path);

$unload.when(function() {
  NACL.close();
});

////////////////////////////////////////////////////////////////////////////////
// Strings, Types

const pustr = $ctypes.unsigned_char.ptr,
      Sizey = $ctypes.unsigned_long_long;

function ustr_t(x) {
  return $ctypes.unsigned_char.array(x);
}
function alloc_ustr(len) {
  return $ctypes.unsigned_char.array(len)();
}

/**
 * Convert an 8-bit binary string of known length to a JavaScript string.
 */
function BinStrToJSStr(ctypesBinStr, offset, length) {
  let s = "";
  for (let i = offset; i < length; i++) {
    s += String.fromCharCode(ctypesBinStr[i]);
  }
  return s;
}

/**
 * Convert a *null-terminated* utf8-encoded string stored in a ctypes rep to a
 *  JS string rep.  You need to make sure you allocated space for an put a nul
 *  in!
 */
function Utf8StrToJSStr(ctypesUtf8Str, offset) {
  if (offset)
    ctypesUtf8Str = ctypesUtf8Str.addressOfElement(offset);
  return ctypesUtf8Str.readString();
}

/**
 * Convert a JS string that contains a (binary-encoded) utf8-string inside of it
 *  into the proper JS string representation of that string, effectively just
 *  performing utf-8 decoding.
 */
function JSUtf8StrToJSStr(u8str) {
  let binStr = JSStrToBinStr(u8str, 0);
  return Utf8StrToJSStr(binStr, 0);
}

/**
 * Convert a JS string containing an 8-bit binary string into a ctypes 8-bit
 *  binary string.
 */
function JSStrToBinStr(jsStr, offset) {
  let binStr = alloc_ustr(jsStr.length), length = jsStr.length;
  for (let i = offset; i < length; i++) {
    binStr[i - offset] = jsStr.charCodeAt(i);
  }
  return binStr;
}

/**
 * Convert a standard utf-16 JS string into a ctypes 8-bit utf-8 encoded string.
 */
function JSStrToUtf8Str(jsStr) {
  return $ctypes.unsigned_char.array()(jsStr);
}

// XXX we really want to expose friendly symbols instead of requiring this
//  absurdity...
const SIGN_IMPL = "_edwards25519sha512batch_ref",
      BOX_IMPL = "_curve25519xsalsa20poly1305_ref",
      SECRETBOX_IMPL = "_xsalsa20poly1305_ref",
      AUTH_IMPL = "_hmacsha512256_ref",
      HASH_IMPL = "_sha512_ref";

////////////////////////////////////////////////////////////////////////////////
// Custom Exceptions

function gimmeStack() {
  try {
    throw new Error("blah");
  }
  catch(ex) {
    return ex.stack;
  }
  return null;
}

function BadBoxError(msg) {
  this.message = msg;
  this.stack = gimmeStack();
}
exports.BadBoxError = BadBoxError;
BadBoxError.prototype = {
  __proto__: Error.prototype,
 name: 'BadBoxError',
};

function BadSignatureError(msg) {
  this.message = msg;
  this.stack = gimmeStack();
}
exports.BadSignatureError = BadSignatureError;
BadSignatureError.prototype = {
  __proto__: Error.prototype,
 name: 'BadSignatureError',
};

function BadSecretBoxError(msg) {
  this.message = msg;
  this.stack = gimmeStack();
}
exports.BadSecretBoxError = BadSecretBoxError;
BadSecretBoxError.prototype = {
  __proto__: Error.prototype,
 name: 'BadSecretBoxError',
};

function BadAuthenticatorError(msg) {
  this.message = msg;
  this.stack = gimmeStack();
}
exports.BadAuthenticatorError = BadAuthenticatorError;
BadAuthenticatorError.prototype = {
  __proto__: Error.prototype,
 name: 'BadAuthenticatorError',
};

////////////////////////////////////////////////////////////////////////////////
// Random Data Support

let randombytes = NACL.declare("randombytes",
                               $ctypes.default_abi,
                               $ctypes.void_t,
                               pustr, Sizey);

function random_byte_getter(howmany) {
  let arrType = ustr_t(howmany);
  return function() {
    let arr = arrType();
    randombytes(arr, howmany);
    return BinStrToJSStr(arr, 0, howmany);
  };
}

////////////////////////////////////////////////////////////////////////////////
// Signing


const crypto_sign_SECRETKEYBYTES = 64,
      crypto_sign_PUBLICKEYBYTES = 32,
      crypto_sign_BYTES = 64;

const SignPublicKeyBstr = ustr_t(crypto_sign_PUBLICKEYBYTES),
      SignSecretKeyBstr = ustr_t(crypto_sign_SECRETKEYBYTES),
      SignMessageBstr = pustr,
      SignSignedMessageBstr = pustr;

let crypto_sign_keypair = NACL.declare("crypto_sign" + SIGN_IMPL + "_keypair",
                                      $ctypes.default_abi,
                                      $ctypes.int,
                                      SignPublicKeyBstr,
                                      SignSecretKeyBstr);

exports.sign_keypair = function() {
  let pk = SignPublicKeyBstr(),
      sk = SignSecretKeyBstr();

  if (crypto_sign_keypair(pk, sk) !== 0)
    throw new BadSignatureError("inexplicably failed to create keypair");

  return {
    sk: BinStrToJSStr(sk, 0, crypto_sign_SECRETKEYBYTES),
    pk: BinStrToJSStr(pk, 0, crypto_sign_PUBLICKEYBYTES),
  };
};

let crypto_sign = NACL.declare("crypto_sign" + SIGN_IMPL,
                               $ctypes.default_abi,
                               $ctypes.int,
                               SignSignedMessageBstr,
                               Sizey.ptr,
                               SignMessageBstr,
                               Sizey,
                               SignSecretKeyBstr);

exports.sign = function(jsm, sk) {
  if (sk.length !== crypto_sign_SECRETKEYBYTES)
    throw new BadSignatureError("incorrect secret-key length");

  let m = JSStrToBinStr(jsm, 0), m_len = m.length;
  let sm = alloc_ustr(m_len + crypto_sign_BYTES);

  let sm_len = Sizey();
  if (crypto_sign(sm, sm_len.address(), m, m_len, JSStrToBinStr(sk, 0)) !== 0)
    throw new BadSignatureError("inexplicably failed to sign message");

  return BinStrToJSStr(sm, 0, sm_len.address().contents);
};

exports.sign_utf8 = function(jsm, sk) {
  if (sk.length !== crypto_sign_SECRETKEYBYTES)
    throw new BadSignatureError("incorrect secret-key length");

  let m = JSStrToUtf8Str(jsm, 0), m_len = m.length - 1; //eat nul
  let sm = alloc_ustr(m_len + crypto_sign_BYTES);

  let sm_len = Sizey();
  if (crypto_sign(sm, sm_len.address(), m, m_len, JSStrToBinStr(sk, 0)) !== 0)
    throw new BadSignatureError("inexplicably failed to sign message");
  return BinStrToJSStr(sm, 0, sm_len.address().contents);
};

let crypto_sign_open = NACL.declare("crypto_sign" + SIGN_IMPL + "_open",
                                    $ctypes.default_abi,
                                    $ctypes.int,
                                    SignMessageBstr,
                                    Sizey.ptr,
                                    SignMessageBstr,
                                    Sizey,
                                    SignSecretKeyBstr);

exports.sign_open = function(js_sm, pk) {
  if (pk.length !== crypto_sign_PUBLICKEYBYTES)
    throw new BadSignatureError("incorrect public-key length: " + pk.length);
  if (js_sm.length < crypto_sign_BYTES)
    throw new BadSignatureError(
      "message is smaller than the minimum signed message size");

  let sm = JSStrToBinStr(js_sm, 0), sm_len = sm.length;

  let m = alloc_ustr(sm_len),
      m_len = Sizey();

  if (crypto_sign_open(m, m_len.address(), sm, sm_len, JSStrToBinStr(pk, 0)))
    throw new BadSignatureError("ciphertext fails verification");

  return BinStrToJSStr(m, 0, m_len.address().contents);
}

exports.sign_open_utf8 = function(js_sm, pk) {
  if (pk.length !== crypto_sign_PUBLICKEYBYTES)
    throw new BadSignatureError("incorrect public-key length: " + pk.length);
  if (js_sm.length < crypto_sign_BYTES)
    throw new BadSignatureError(
      "message is smaller than the minimum signed message size");

  let sm = JSStrToBinStr(js_sm, 0), sm_len = sm.length;

  let m = alloc_ustr(sm_len + 1), // null terminator needs a spot
      m_len = Sizey();

  if (crypto_sign_open(m, m_len.address(), sm, sm_len, JSStrToBinStr(pk, 0)))
    throw new BadSignatureError("ciphertext fails verification");
  m[m_len] = 0;

  return Utf8StrToJSStr(m, 0, m_len.address().contents);
}

exports.sign_peek = function(js_sm) {
  return js_sm.substring(crypto_sign_BYTES / 2,
                         js_sm.length - crypto_sign_BYTES / 2);
}

exports.sign_peek_utf8 = function(js_sm) {
  var binstr = js_sm.substring(crypto_sign_BYTES / 2,
                               js_sm.length - crypto_sign_BYTES / 2);
  return JSUtf8StrToJSStr(binstr);
}

////////////////////////////////////////////////////////////////////////////////
// Boxing

const crypto_box_PUBLICKEYBYTES = 32,
      crypto_box_SECRETKEYBYTES = 32,
      crypto_box_BEFORENMBYTES = 32,
      crypto_box_NONCEBYTES = 24,
      crypto_box_ZEROBYTES = 32,
      crypto_box_BOXZEROBYTES = 16;

exports.box_PUBLICKEYBYTES = crypto_box_PUBLICKEYBYTES;
exports.box_SECRETKEYBYTES = crypto_box_SECRETKEYBYTES;

const BoxPublicKeyBstr = ustr_t(crypto_box_PUBLICKEYBYTES),
      BoxSecretKeyBstr = ustr_t(crypto_box_SECRETKEYBYTES),
      BoxNonceBstr = ustr_t(crypto_box_NONCEBYTES),
      BoxMessageBstr = pustr,
      BoxCiphertextBstr = pustr;

let crypto_box_keypair = NACL.declare("crypto_box" + BOX_IMPL + "_keypair",
                                      $ctypes.default_abi,
                                      $ctypes.int,
                                      BoxPublicKeyBstr,
                                      BoxSecretKeyBstr);

exports.box_keypair = function() {
  let pk = BoxPublicKeyBstr(),
      sk = BoxSecretKeyBstr();

  if (crypto_box_keypair(pk, sk) !== 0)
    throw new BadBoxError("inexplicably failed to create keypair");

  return {
    sk: BinStrToJSStr(sk, 0, crypto_box_SECRETKEYBYTES),
    pk: BinStrToJSStr(pk, 0, crypto_box_PUBLICKEYBYTES),
  };
};

let crypto_box = NACL.declare("crypto_box" + BOX_IMPL,
                              $ctypes.default_abi,
                              $ctypes.int,
                              BoxCiphertextBstr,
                              BoxMessageBstr,
                              Sizey,
                              BoxNonceBstr,
                              BoxPublicKeyBstr,
                              BoxSecretKeyBstr);

/**
 * Box a binary message string (*not* utf8), producing a binary string.
 */
exports.box = function(m, n, pk, sk) {
  if (pk.length !== crypto_box_PUBLICKEYBYTES)
    throw new BadBoxError("incorrect public-key length");
  if (sk.length !== crypto_box_SECRETKEYBYTES)
    throw new BadBoxError("incorrect secret-key length");
  if (n.length !== crypto_box_NONCEBYTES)
    throw new BadBoxError("incorrect nonce length");

  // the message needs to get zero padded (from the beginning)
  let m_padded_len = m.length + crypto_box_ZEROBYTES,
      m_padded = alloc_ustr(m_padded_len);
  for (let i = 0; i < crypto_box_ZEROBYTES; i++) {
    m_padded[i] = 0;
  }
  for (let i = crypto_box_ZEROBYTES; i < m_padded_len; i++) {
    m_padded[i] = m.charCodeAt(i - crypto_box_ZEROBYTES);
  }

  // the output message will accordingly also be padded
  let c_padded = alloc_ustr(m_padded_len);

  if (crypto_box(c_padded, m_padded, m_padded_len,
                 JSStrToBinStr(n, 0),
                 JSStrToBinStr(pk, 0), JSStrToBinStr(sk, 0)) !== 0)
    throw new BadBoxError("inexplicable binary string boxing failure");

  return BinStrToJSStr(c_padded, crypto_box_BOXZEROBYTES, m_padded_len);
};

/**
 * Box a utf8 message string, producing a binary string.
 */
exports.box_utf8 = function(jsm, n, pk, sk) {
  if (pk.length !== crypto_box_PUBLICKEYBYTES)
    throw new BadBoxError("incorrect public-key length");
  if (sk.length !== crypto_box_SECRETKEYBYTES)
    throw new BadBoxError("incorrect secret-key length");
  if (n.length !== crypto_box_NONCEBYTES)
    throw new BadBoxError("incorrect nonce length");

  // convert the JS string to a null-terminated utf8 string to use as input
  let m = $ctypes.unsigned_char.array()(jsm);

  // the message needs to get zero padded (from the beginning), but we don't
  //  need to care about the nul-padded character
  let m_padded_len = m.length - 1 + crypto_box_ZEROBYTES,
      m_padded = alloc_ustr(m_padded_len);
  for (let i = 0; i < crypto_box_ZEROBYTES; i++) {
    m_padded[i] = 0;
  }
  for (let i = crypto_box_ZEROBYTES; i < m_padded_len; i++) {
    m_padded[i] = m[i - crypto_box_ZEROBYTES];
  }

  // the output message will accordingly also be padded
  let c_padded = alloc_ustr(m_padded_len);

  if (crypto_box(c_padded, m_padded, m_padded_len,
                 JSStrToBinStr(n, 0),
                 JSStrToBinStr(pk, 0), JSStrToBinStr(sk, 0)) !== 0)
    throw new BadBoxError("inexplicable binary string boxing failure");

  return BinStrToJSStr(c_padded, crypto_box_BOXZEROBYTES, m_padded_len);
};

let crypto_box_open = NACL.declare("crypto_box" + BOX_IMPL + "_open",
                                   $ctypes.default_abi,
                                   $ctypes.int,
                                   BoxMessageBstr,
                                   BoxCiphertextBstr,
                                   Sizey,
                                   BoxNonceBstr,
                                   BoxPublicKeyBstr,
                                   BoxSecretKeyBstr);

/**
 * Open a box provided as a binary string, interpreting the result as a binary
 *  string and encoding it appropriately.
 */
exports.box_open = function(c, n, pk, sk) {
  if (pk.length !== crypto_box_PUBLICKEYBYTES)
    throw new BadBoxError("incorrect public-key length");
  if (sk.length !== crypto_box_SECRETKEYBYTES)
    throw new BadBoxError("incorrect secret-key length");
  if (n.length !== crypto_box_NONCEBYTES)
    throw new BadBoxError("incorrect nonce length");

  // the ciphertext gets padded out with zeroes just like when boxing.
  let c_padded_len = c.length + crypto_box_BOXZEROBYTES,
      c_padded = alloc_ustr(c_padded_len);
  for (let i = 0; i < crypto_box_BOXZEROBYTES; i++) {
    c_padded[i] = 0;
  }
  for (let i = crypto_box_BOXZEROBYTES; i < c_padded_len; i++) {
    c_padded[i] = c.charCodeAt(i - crypto_box_BOXZEROBYTES);
  }

  let m_padded = alloc_ustr(c_padded_len);
  if (crypto_box_open(m_padded, c_padded, c_padded_len,
                      JSStrToBinStr(n, 0),
                      JSStrToBinStr(pk, 0), JSStrToBinStr(sk, 0)) !== 0)
    throw new BadBoxError("ciphertext fails verification");
  // we are mimicking the C++ binding here even though we will have crashed by
  //  this point... (we guard at a higher level because this is dumb)
  if (c_padded_len < crypto_box_ZEROBYTES)
    throw new BadBoxError("ciphertext too short");
  return BinStrToJSStr(m_padded, crypto_box_ZEROBYTES, c_padded_len);
};
/**
 * Open a box, interpreting the result as a ut8 string and decoding it to a JS
 *  string appropriately.
 */
exports.box_open_utf8 = function(c, n, pk, sk) {
  if (pk.length !== crypto_box_PUBLICKEYBYTES)
    throw new BadBoxError("incorrect public-key length");
  if (sk.length !== crypto_box_SECRETKEYBYTES)
    throw new BadBoxError("incorrect secret-key length");
  if (n.length !== crypto_box_NONCEBYTES)
    throw new BadBoxError("incorrect nonce length");

  // the ciphertext gets padded out with zeroes just like when boxing.
  let c_padded_len = c.length + crypto_box_BOXZEROBYTES,
      c_padded = alloc_ustr(c_padded_len);
  for (let i = 0; i < crypto_box_BOXZEROBYTES; i++) {
    c_padded[i] = 0;
  }
  for (let i = crypto_box_BOXZEROBYTES; i < c_padded_len; i++) {
    c_padded[i] = c.charCodeAt(i - crypto_box_BOXZEROBYTES);
  }

  let m_padded = alloc_ustr(c_padded_len + 1); // add one for the nul
  if (crypto_box_open(m_padded, c_padded, c_padded_len,
                      JSStrToBinStr(n, 0),
                      JSStrToBinStr(pk, 0), JSStrToBinStr(sk, 0)) !== 0)
    throw new BadBoxError("ciphertext fails verification");
  // we are mimicking the C++ binding here even though we will have crashed by
  //  this point... (we guard at a higher level because this is dumb)
  if (c_padded_len < crypto_box_ZEROBYTES)
    throw new BadBoxError("ciphertext too short");

  // poke the nul in.
  m_padded[c_padded_len] = 0;
  return Utf8StrToJSStr(m_padded, crypto_box_ZEROBYTES);
};

exports.box_random_nonce = random_byte_getter(crypto_box_NONCEBYTES);

////////////////////////////////////////////////////////////////////////////////
// Secretbox

const crypto_secretbox_KEYBYTES = 32,
      crypto_secretbox_NONCEBYTES = 24,
      crypto_secretbox_ZEROBYTES = 32,
      crypto_secretbox_BOXZEROBYTES = 16;

exports.secretbox_KEYBYTES = crypto_secretbox_KEYBYTES;

const SecretBoxKeyBstr = ustr_t(crypto_secretbox_KEYBYTES),
      SecretBoxNonceBstr = ustr_t(crypto_secretbox_NONCEBYTES),
      SecretBoxMessageBstr = pustr,
      SecretBoxCiphertextBstr = pustr;

let crypto_secretbox = NACL.declare("crypto_secretbox" + SECRETBOX_IMPL,
                                    $ctypes.default_abi,
                                    $ctypes.int,
                                    SecretBoxCiphertextBstr,
                                    SecretBoxMessageBstr,
                                    Sizey,
                                    SecretBoxNonceBstr,
                                    SecretBoxKeyBstr);

/**
 * Secretbox a binary message string (*not* utf8), producing a binary string.
 */
exports.secretbox = function(m, n, k) {
  if (k.length !== crypto_secretbox_KEYBYTES)
    throw new BadSecretBoxError("incorrect public-key length");
  if (n.length !== crypto_secretbox_NONCEBYTES)
    throw new BadSecretBoxError("incorrect nonce length");

  // the message needs to get zero padded (from the beginning)
  let m_padded_len = m.length + crypto_secretbox_ZEROBYTES,
      m_padded = alloc_ustr(m_padded_len);
  for (let i = 0; i < crypto_secretbox_ZEROBYTES; i++) {
    m_padded[i] = 0;
  }
  for (let i = crypto_secretbox_ZEROBYTES; i < m_padded_len; i++) {
    m_padded[i] = m.charCodeAt(i - crypto_secretbox_ZEROBYTES);
  }

  // the output message will accordingly also be padded
  let c_padded = alloc_ustr(m_padded_len);

  if (crypto_secretbox(c_padded, m_padded, m_padded_len,
                       JSStrToBinStr(n, 0),
                       JSStrToBinStr(k, 0)) !== 0)
    throw new BadSecretBoxError("inexplicable binary string boxing failure");

  return BinStrToJSStr(c_padded, crypto_secretbox_BOXZEROBYTES, m_padded_len);
};
/**
 * Secretbox a binary message string (*not* utf8), producing a binary string.
 */
exports.secretbox_utf8 = function(js_m, n, k) {
  if (k.length !== crypto_secretbox_KEYBYTES)
    throw new BadSecretBoxError("incorrect public-key length");
  if (n.length !== crypto_secretbox_NONCEBYTES)
    throw new BadSecretBoxError("incorrect nonce length");

  let m = $ctypes.unsigned_char.array()(js_m);

  // the message needs to get zero padded (from the beginning), but we don't
  //  need to care about the nul-padded character
  let m_padded_len = m.length - 1 + crypto_secretbox_ZEROBYTES,
      m_padded = alloc_ustr(m_padded_len);
  for (let i = 0; i < crypto_secretbox_ZEROBYTES; i++) {
    m_padded[i] = 0;
  }
  for (let i = crypto_secretbox_ZEROBYTES; i < m_padded_len; i++) {
    m_padded[i] = m[i - crypto_secretbox_ZEROBYTES];
  }

  // the output message will accordingly also be padded
  let c_padded = alloc_ustr(m_padded_len);

  if (crypto_secretbox(c_padded, m_padded, m_padded_len,
                       JSStrToBinStr(n, 0),
                       JSStrToBinStr(k, 0)) !== 0)
    throw new BadSecretBoxError("inexplicable binary string boxing failure");

  return BinStrToJSStr(c_padded, crypto_secretbox_BOXZEROBYTES, m_padded_len);
};

let crypto_secretbox_open =
  NACL.declare("crypto_secretbox" + SECRETBOX_IMPL + "_open",
               $ctypes.default_abi,
               $ctypes.int,
               SecretBoxMessageBstr,
               SecretBoxCiphertextBstr,
               Sizey,
               SecretBoxNonceBstr,
               SecretBoxKeyBstr);

exports.secretbox_open = function(c, n, k) {
  if (k.length !== crypto_secretbox_KEYBYTES)
    throw new BadSecretBoxError("incorrect public-key length");
  if (n.length !== crypto_secretbox_NONCEBYTES)
    throw new BadSecretBoxError("incorrect nonce length");

  // the ciphertext gets padded out with zeroes just like when boxing.
  let c_padded_len = c.length + crypto_secretbox_BOXZEROBYTES,
      c_padded = alloc_ustr(c_padded_len);
  for (let i = 0; i < crypto_secretbox_BOXZEROBYTES; i++) {
    c_padded[i] = 0;
  }
  for (let i = crypto_secretbox_BOXZEROBYTES; i < c_padded_len; i++) {
    c_padded[i] = c.charCodeAt(i - crypto_secretbox_BOXZEROBYTES);
  }

  let m_padded = alloc_ustr(c_padded_len);
  if (crypto_secretbox_open(m_padded, c_padded, c_padded_len,
                            JSStrToBinStr(n, 0),
                            JSStrToBinStr(k, 0)) !== 0)
    throw new BadSecretBoxError("ciphertext fails verification");
  // we are mimicking the C++ binding here even though we will have crashed by
  //  this point... (we guard at a higher level because this is dumb)
  if (c_padded_len < crypto_secretbox_ZEROBYTES)
    throw new BadSecretBoxError("ciphertext too short");
  return BinStrToJSStr(m_padded, crypto_secretbox_ZEROBYTES, c_padded_len);
};
exports.secretbox_open_utf8 = function(c, n, k) {
  if (k.length !== crypto_secretbox_KEYBYTES)
    throw new BadSecretBoxError("incorrect public-key length");
  if (n.length !== crypto_secretbox_NONCEBYTES)
    throw new BadSecretBoxError("incorrect nonce length");

  // the ciphertext gets padded out with zeroes just like when boxing.
  let c_padded_len = c.length + crypto_secretbox_BOXZEROBYTES,
      c_padded = alloc_ustr(c_padded_len);
  for (let i = 0; i < crypto_secretbox_BOXZEROBYTES; i++) {
    c_padded[i] = 0;
  }
  for (let i = crypto_secretbox_BOXZEROBYTES; i < c_padded_len; i++) {
    c_padded[i] = c.charCodeAt(i - crypto_secretbox_BOXZEROBYTES);
  }

  let m_padded = alloc_ustr(c_padded_len + 1); // add one for the nul
  if (crypto_secretbox_open(m_padded, c_padded, c_padded_len,
                            JSStrToBinStr(n, 0),
                            JSStrToBinStr(k, 0)) !== 0)
    throw new BadSecretBoxError("ciphertext fails verification");
  // we are mimicking the C++ binding here even though we will have crashed by
  //  this point... (we guard at a higher level because this is dumb)
  if (c_padded_len < crypto_secretbox_ZEROBYTES)
    throw new BadSecretBoxError("ciphertext too short");

  // poke the nul in.
  m_padded[c_padded_len] = 0;
  return Utf8StrToJSStr(m_padded, crypto_secretbox_ZEROBYTES);
};

exports.secretbox_random_nonce = random_byte_getter(crypto_secretbox_NONCEBYTES);
exports.secretbox_random_key = random_byte_getter(crypto_secretbox_KEYBYTES);

////////////////////////////////////////////////////////////////////////////////
// Authenticators

const crypto_auth_BYTES = 32,
      crypto_auth_KEYBYTES = 32;

exports.auth_KEYBYTES = crypto_auth_KEYBYTES;

const AuthKeyBstr = ustr_t(crypto_auth_KEYBYTES),
      AuthMessageBstr = pustr,
      AuthAuthenticatorBstr = ustr_t(crypto_auth_BYTES);

let crypto_auth = NACL.declare("crypto_auth" + AUTH_IMPL,
                               $ctypes.default_abi,
                               $ctypes.int,
                               AuthAuthenticatorBstr,
                               AuthMessageBstr,
                               Sizey,
                               AuthKeyBstr);

exports.auth = function(m, k) {
  if (k.length !== crypto_auth_KEYBYTES)
    throw new BadAuthenticatorError("incorrect key length");

  let a = AuthAuthenticatorBstr();
  if (crypto_auth(a, JSStrToBinStr(m, 0), m.length,
                  JSStrToBinStr(k, 0)) !== 0)
    throw new BadAuthenticatorError("inexplicable auth gen failure");

  return BinStrToJSStr(a, 0, crypto_auth_KEYBYTES);
};
exports.auth_utf8 = function(js_m, k) {
  if (k.length !== crypto_auth_KEYBYTES)
    throw new BadAuthenticatorError("incorrect key length");

  let m = $ctypes.unsigned_char.array()(js_m), m_len = m.length - 1;

  let a = AuthAuthenticatorBstr();
  if (crypto_auth(a, m, m_len,
                  JSStrToBinStr(k, 0)) !== 0)
    throw new BadAuthenticatorError("inexplicable auth gen failure");

  return BinStrToJSStr(a, 0, crypto_auth_KEYBYTES);
};

let crypto_auth_verify = NACL.declare("crypto_auth" + AUTH_IMPL + "_verify",
                                      $ctypes.default_abi,
                                      $ctypes.int,
                                      AuthAuthenticatorBstr,
                                      AuthMessageBstr,
                                      Sizey,
                                      AuthKeyBstr);
exports.auth_verify = function(a, m, k) {
  if (k.length !== crypto_auth_KEYBYTES)
    throw new BadAuthenticatorError("incorrect key length");
  if (a.length !== crypto_auth_BYTES)
    throw new BadAuthenticatorError("incorrect authenticator length");

  if (crypto_auth_verify(JSStrToBinStr(a, 0),
                         JSStrToBinStr(m, 0), m.length,
                         JSStrToBinStr(k, 0)) !== 0)
    throw new BadAuthenticatorError("invalid authenticator");
};

exports.auth_verify_utf8 = function(a, js_m, k) {
  if (k.length !== crypto_auth_KEYBYTES)
    throw new BadAuthenticatorError("incorrect key length");
  if (a.length !== crypto_auth_BYTES)
    throw new BadAuthenticatorError("incorrect authenticator length");

  let m = $ctypes.unsigned_char.array()(js_m), m_len = m.length - 1;

  if (crypto_auth_verify(JSStrToBinStr(a, 0),
                         m, m_len,
                         JSStrToBinStr(k, 0)) !== 0)
    throw new BadAuthenticatorError("invalid authenticator");
};


exports.auth_random_key = random_byte_getter(crypto_auth_KEYBYTES);

////////////////////////////////////////////////////////////////////////////////
// Hashers
//
//

const crypto_hash_BYTES = 64,
      crypto_hash_TRUNCATED = 32;

const HashHashBstr = ustr_t(crypto_hash_BYTES),
      HashMessageBstr = pustr;

let crypto_hash = NACL.declare("crypto_hash" + HASH_IMPL,
                               $ctypes.default_abi,
                               $ctypes.int,
                               HashHashBstr,
                               HashMessageBstr,
                               Sizey);

exports.hash512_256 = function(m) {
  let h = HashHashBstr();

  if (crypto_hash(h, JSStrToBinStr(m, 0), m.length) !== 0)
    throw new Error("inexplicable hashing failure");
  // truncate to just the first 32 bytes.
  return BinStrToJSStr(h, 0, crypto_hash_TRUNCATED);
};
exports.hash512_256_utf8 = function(js_m) {
  let h = HashHashBstr();

  let m = JSStrToUtf8Str(js_m, 0), m_len = m.length - 1; // ignore nul

  if (crypto_hash(h, m, m_len) !== 0)
    throw new Error("inexplicable hashing failure");
  // truncate to just the first 32 bytes.
  return BinStrToJSStr(h, 0, crypto_hash_TRUNCATED);
};

////////////////////////////////////////////////////////////////////////////////
