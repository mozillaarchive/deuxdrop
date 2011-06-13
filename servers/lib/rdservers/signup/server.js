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
 *
 *
 * @typedef[ClientSignupBundle @dict[
 *   @key[selfIdent PersonSelfIdentBlob]{
 *     The identity that is signing up.
 *   }
 *   @key[clientAuths @listof[PersonClientAuthBlob]]{
 *     Authorized clients to allow to contact the server on the identity's
 *     behalf (signed by the `longtermSignPubKey`).
 *   }
 *   @key[because SignupBecause]{
 *     The client's reason we should sign it up.
 *   }
 * ]]{
 *
 * }
 *
 * @typedef[SignupBecause @dict[
 *   @key[type "existing-account:webfinger"]
 *   @key[accountName String]{
 *     The e-mail address in question.
 *   }
 * ]]{
 *   Currently just our webfinger mechanism.
 * }
 **/

define(
  [
    'exports'
  ],
  function(
    exports
  ) {

const SIGNUP_TEMPORARY_INVOCATION = "auto:hackjob";

/**
 * Allow a new user/identity to register itself with this server.  Registration
 *  may potentially happen quickly in-band or require some out-of-band
 *  verification.
 *
 * General criteria for signup could be:
 * - Open signup, all supplicants accepted, but lacking any fallback account
 *    recovery stuff.
 * - Out-of-band limited identify verification (+ for account recovery), ex:
 *    send e-mail with confirmation URL, text message with confirmation URL.
 * - In-band signed attestation from trusted source, such as a friend saying
 *    they are cool (possibly throttled by invite caps) or a company
 *    authority signing an attestation.
 *
 * Our current approach is a variant of limited identity verification that
 *  reuses our webfinger support.  The user needs to put a link in their
 *  webfinger profile that is a link to our server and names the root
 *  identity key they are using.  This expresses a willingness by the owner
 *  of the e-mail address to be associated with the identity in question and
 *  allows us to then limit account signup to specific domains or e-mail
 *  addresses in our initial testing configuration.
 *
 * The link we generate is predictable; we do not hash the identity key with a
 *  secret or anything like that.  It's just the identity key in base 64.
 */
function SignupConnection(conn) {
  this.conn = conn;
}
SignupConnection.prototype = {
  /**
   * The client signing up provides us with:
   * -
   *
   * @args[
   *   @param[msg ClientSignupBundle]
   * ]
   */
  _msg_init_signup: function(msg) {


    // issue the challenge
    this.conn.writeMessage({
      type: 'challenge',
      challenge: {
        mechanism: SIGNUP_TEMPORARY_INVOCATION,
    });
    return 'init';
  },
};

exports.makeServerDef = function(serverIdent) {
  return {
    endpoints: {
      'signup/signup': {
        implClass: SignupConnection,
        serverIdent: serverIdent,
        authVerifier: function(endpoint, clientKey) {
          // (we have no identity on file)
          return true;
        },
      },
    },
  };
};

}); // end define
