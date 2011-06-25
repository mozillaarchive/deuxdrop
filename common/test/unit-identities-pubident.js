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
 * Unit tests for `rdcommon/identities/pubident.js`.
 **/

define(
  [
    'assert',
    'rdcommon/testcontext',
    'rdcommon/crypto/keyring',
    'rdcommon/identities/pubident',
    'module',
    'exports'
  ],
  function(
    assert,
    $tc,
    $keyring,
    $pubident,
    $module,
    exports
  ) {

var TD = exports.TD = $tc.defineTestsFor($module, null, null,
                                         ['abstraction:identity']);

TD.commonSimple('serverSelfIdent creation', function test_serverSelfIdent() {
  var rootKeyring = $keyring.createNewServerRootKeyring();
  var longtermBoxingKeyring = rootKeyring.issueLongtermBoxingKeyring();

  var details = {
    tag: 'server:dummy',
    url: 'ws://127.0.0.1:80/',
  };
  var signedSelfIdent = $pubident.generateServerSelfIdent(
                          rootKeyring, longtermBoxingKeyring, details);
  var payload = $pubident.assertGetServerSelfIdent(signedSelfIdent);

  // make sure we get any payload
  assert.notEqual(payload, null);

  // make sure the spec'ed details all got in there correctly.
  assert.equal(details.tag, payload.tag);
  assert.equal(details.url, payload.url);

  // make sure the keys got in there correctly
  assert.equal(payload.publicKey, longtermBoxingKeyring.boxingPublicKey);
  assert.equal(payload.rootPublicKey, rootKeyring.rootPublicKey);
});

TD.commonSimple('personSelfIdent creation', function test_personSelfIdent() {
  var rootKeyring, longtermKeyring, keyring;

  rootKeyring = $keyring.createNewPersonRootKeyring();
  longtermKeyring = rootKeyring.issueLongtermSigningKeyring();
  keyring = longtermKeyring.makeDelegatedKeyring();

  // -- create the messaging key group
  keyring.incorporateKeyGroup(
    longtermKeyring.issueKeyGroup('messaging', {
        envelope: 'box',
        body: 'box',
        announce: 'sign',
        tell: 'box',
      }));


  // -- create the server-less self-ident
  var poco = {displayName: 'Santy Claus'};
  var personSelfIdentBlob = $pubident.generatePersonSelfIdent(
                              longtermKeyring, keyring,
                              poco, null);

  var payload = $pubident.assertGetPersonSelfIdent(personSelfIdentBlob);
  assert.notEqual(payload, null);
  assert.equal(payload.poco.displayName, poco.displayName);
});

}); // end define
