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
 * Create a fully formed message for transport.
 *
 * All of the below data types are currently implemented using JSON, but will
 * be converted into thrift representations (or other efficiently packed
 * representations) eventually.
 *
 * @typedef[MaildropTransitEnvelope @dict[
 *   @key[senderHash]{
 *   }
 *   @key[recipHash]{
 *   }
 *   @key[nonce]{
 *     The nonce used for all encryption for this message and sub-parts.
 *   }
 *   @key[version Integer]{
 *     Schema version for sanity checking; there is no support for inter-version
 *     operation during the development phase, but we want to be able to detect
 *     such an attempt and fail-fast.
 *   }
 *   @key[envelope EncStorageEnvelope]{
 *   }
 * ]]{
 *   This blob gets signed by the sender.
 * }
 *
 * @typedef[StorageEnvelope @dict[
 *   @key[convId]{
 *     Conversation-id, an opaque randomly generated identifier for the
 *     conversation.
 *   }
 *   @key[composedAt DateMS]{
 *     Composition date of the message.
 *   }
 *   @key[payload EncMessagePayload]{
 *   }
 * ]]{
 *   The storage envelope contains meta-data about the message that is for use
 *   by the mailstore (and friends) to be able to classify/prioritize the mail
 *   without needing to see the actual message contents in the `MessagePayload`.
 *
 *   It is encrypted
 * }
 *
 * @typedef[MessagePayload @dict[
 *   @key[subject #:optional String]{
 *     Proposed (new) subject for the conversation, if present.
 *   }
 *   @key[body String]{
 *     The message payload, presently plaintext, eventually simplified HTML
 *     (most likely).
 *   }
 * ]]{
 *   The message payload contains the actual contents of the message.
 * }
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
 *
 */
exports.encryptTransitMessage = function(senderFullIdent,
                                         envelope, payload,
                                         recipPubIdent) {

  var nonce = $nacl.box_random_nonce;
  var strPayload = JSON.stringify(payload);
  var encPayload = $nacl.box(strPayload, nonce,
                             recipPubIdent.payloadPubKey,
                             senderFullIdent.secret.authorshipBoxSecKey);

  var dupEnvelope = {};
  for (var key in envelope) {
    dupEnvelope[key] = envelope[key];
  }
  dupEnvelope.payload = encPayload;

  var strEnvelope = JSON.stringify(dupEnvelope);
  var encEnvelope = $nacl.box(strEnvelope, nonce,
                              recipPubIdent.envelopePubKey,
                              senderFullIdent.secret.authorshipBoxSecKey);


};

}); // end define
