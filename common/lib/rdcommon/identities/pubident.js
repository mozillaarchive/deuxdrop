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
 * @typedef[PubPersonSelfIdent @dict[
 *   @key[name String]{
 *     Identity's claimed name.
 *   }
 *   @key[suggestedNick String]{
 *     The identity's suggested nickname for itself.
 *   }
 *
 *   @key[rootSignPubKey]{
 *     The root public key for this identity which must be the same used to sign
 *     the `PubPersonSelfIdent` blob.  The identity may use different keys for
 *     all other tasks.
 *
 *     The idea is that the identity's root secret key may be protected with
 *     a much greater degree of security (ex: written in disappearing ink in pig
 *     latin on a piece of highly flammable paper that lives in a safe deposit
 *     box) than the other keys whose day-to-day usage necessarily results in a
 *     greater risk of compromise.
 *
 *     Of course, since we have no key life-cycle management, validity ranges,
 *     multiple supported keys, etc., this is more of a stepping stone that
 *     helps us avoid writing code that assumes a single key than an actual
 *     end-game solution.  It is fine to use this key as the value of other
 *     entries in this structure.
 *   }
 *
 *   @key[issuedAt DateMS]{
 *     The timestamp when this identity was created / asserted valid / etc.  We
 *     are currently not dealing with validity ranges and such; this is merely
 *     a debugging stop-gap measure.
 *   }
 *
 *   @key[maildropDNS String]{
 *     The DNS name used to identify the maildrop server(s) authorized to
 *     receive mail for the identity.
 *   }
 *   @key[maildropPubKey]{
 *     The public key of the server/identity authorized to receive mails.
 *   }
 *
 *   @key[mailsenderDNS String]{
 *     The DNS name used to identify the mailsender server(s) authorized to send
 *     mail for the identity.  This is speculative and intended to allow for IP
 *     or other filtering before we even receive our first byte.
 *   }
 *   @key[mailsenderPubKey]{
 *     The public key of the server authorized to send mails.
 *   }
 *
 *   @key[envelopePubKey]{
 *     The public key to use to encrypt the envelope of messages.  This is
 *     different from the payload key so that a user can authorize their
 *     mailstore to be able to read the envelope for processing but not let it
 *     see the payload.
 *   }
 *   @key[payloadPubKey]{
 *     The public key to use to encrypt the payload of messages.
 *   }
 *
 *   @key[authorshipSignPubKey]{
 *     The public key that will be used to sign messages authored by this
 *     identity.
 *   }
 *   @key[authorshipBoxPubKey]{
 *     The public key that will be used to encrypt messages authored by this
 *     identity.
 *   }
 * ]]{
 *   Data structure to be self-signed by an identity that provides their
 *   (claimed) name and all the host and key info to be able to send them
 *   messages and receive messages from them.
 * }
 **/

define(
  [
    'exports'
  ],
  function(
    exports
  ) {

}); // end define
