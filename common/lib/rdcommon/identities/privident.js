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
 * Private identity data structure definition and population.
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


/**
 * Generate a signed self-identification blob that we can hand to someone else
 * and have them know how to talk to us.
 *
 * @args[
 * ]
 * @return[PubPersonSelfIdent]
 */
exports.generateSignedSelfIdent = function generateSignedSelfIdent(details) {
};

/**
 * @args[
 *   @param[details @dict[
 *     @key[name String]
 *     @key[suggestedNick #:optional String]
 *
 *     @key[maildrop MaildropAccountInfo]
 *     @key[mailsender MailsenderAccountInfo]
 *
 *   ]]
 * ]
 */
exports.generateFullIdent = function generateFullIdent(details) {
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

/**
 * Generate an attestation that we are willing to receive mail from the given
 *  identity.  The attestation may enclose additional metadata for routing /
 *  prioritization purposes.
 */
exports.attestWriteMeMail = function attestWriteMeMail() {
};

}); // end define
