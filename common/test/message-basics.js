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
 * Test message generation and processing without any communication involved.
 **/

define(
  [
    'exports'
  ],
  function(
    exports
  ) {

var DUMMY_CONV_ID = "aaaaaaaa", DUMMY_TIMESTAMP = 1304980532222,
    DUMMY_SUBJECT = "Whaaaaat?", DUMMY_BODY = "Abcdefghijklmnop";

/**
 * Create two identities, have one generate a message for the other and verify
 *  that the other can process the generated message; no network traffic or
 *  actual servers involved.
 */
exports.testGenerateThenProcess = function(test) {
  var sender = makeFullIdent({name: "Alice"}),
      recip  = makeFullIdent({name: "Bob"});

  var rawEnvelope = {
    convId: DUMMY_CONV_ID,
    composedAt: DUMMY_TIMESTAMP,
  };
  var rawPayload = {
    subject: DUMMY_SUBJECT,
    body: DUMMY_BODY,
  };

  var signedTransitMessage = $gen.encryptTransitMessage(
                               sender, rawEnvelope, rawPayload, recip.pub);

  var verifiedTransitMessage = $proc.verifyTransitMessage(
                                 signedTransitMessage);
  if (!verifiedTransitMessage)
    throw new Error("Transit message failed verification.");

  var decEnvelope = $proc.decryptEnvelope(verifiedTransitMessage.envelope);
  if (decEnvelope == null)
    throw new Error("Envelope failed to decrypt.");

  test.equal(decEnvelope.convId,     rawEnvelope.convId,     "convId");
  test.equal(decEnvelope.composedAt, rawEnvelope.composedAt, "composedAt");

  var decPayload = $proc.decryptPayload(decEnvelope.payload);
  if (decPayload == null)
    throw new Error("Payload failed to decrypt.");

  test.equal(decPayload.subject, rawPayload.subject, "subject");
  test.equal(decPayload.body,    rawPayload.body,    "body");
};

}); // end define
