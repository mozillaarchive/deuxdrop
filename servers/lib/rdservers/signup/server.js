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
 * XXX And this is not yet implemented.
 *
 * The link we generate is predictable; we do not hash the identity key with a
 *  secret or anything like that.  It's just the identity key in base 64.
 *
 *
 * @typedef[ClientSignupBundle @dict[
 *   @key[selfIdent PersonSelfIdentBlob]{
 *     The identity that is signing up.
 *   }
 *   @key[clientAuths @listof[PersonClientAuthBlob]]{
 *     Authorized clients to allow to contact the server on the identity's
 *     behalf (signed by the `longtermSignPubKey`).  The first entry must be
 *     the client that is attempting to perform the signup operation.
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
    'rdcommon/log',
    'rdcommon/taskidiom', 'rdcommon/taskerrors',
    'rdcommon/crypto/keyops',
    'rdcommon/identities/pubident',
    'module',
    'exports'
  ],
  function(
    $log,
    $task, $taskerrors,
    $keyops,
    $pubident,
    $module,
    exports
  ) {

var LOGFAB = exports.LOGFAB = $log.register($module, {});

var taskMaster = $task.makeTaskMasterForModule($module, LOGFAB);

/**
 * Repurpose the challenge mechanism to convey that this request will never
 *  succeed.
 */
const CHALLENGE_NEVER = "never";
/**
 * They already have an account with us.  The most likely explanations for this
 *  are:
 * - Client bug, it has forgotten it has an account, etc.
 * - An attack attempting to clobber the existing account details with a
 *    different set of details.  This would be useful in the case where the
 *    client registering is not currently authorized on the account or does
 *    not have the credentials required to accomplish its goal within the
 *    legal account-manipulation framework.
 */
const CHALLENGE_ALREADY_SIGNED_UP = "already-signed-up";

const SIGNUP_TEMPORARY_INVOCATION = "auto:hackjob";

/**
 * Validate that the request, regardless of challenges/responses, is in fact a
 *  well-formed and legitimate request.
 *
 * This is implemented as a soft failure task which means that all failures end
 *  up resolving our promise with `false` and success ends up resolving our
 *  promise with whatever it was resolved with.  This is done so that if we
 *  fail, the task that created us will not immediately fail in turn, but can
 *  react to our failure.
 */
var ValidateSignupRequestTask = taskMaster.defineSoftFailureTask({
  name: 'validateSignupRequest',
  steps: {
    /**
     * Make sure the self-ident blob is self-consistent, especially that it
     *  names us as the server of record.
     */
    validateSelfIdent: function() {
      // - self-consistent
      this.personSelfIdentPayload = $pubident.assertGetPersonSelfIdent(
                                      this.arg.msg.selfIdent, null); // (throws)
      // - names us
      // Verify they are using our self-signed blob verbatim.
      if (this.personSelfIdentPayload.transitServerIdent !==
          this.arg.serverConfig.selfIdentBlob)
        throw new $taskerrors.KeyMismatchError("transit server is not us");
    },
    /**
     * Make sure all named clients are authorized and that we are talking to one
     *  of them.
     */
    validateClientAuth: function() {
      var clientAuthBlobs = this.personSelfIdentPayload.clientAuths;
      if (!Array.isArray(clientAuths) || clientAuths.length === 0)
        throw new $taskerrors.MalformedPayloadError();

      // - assert all clients are authorized
      // (There is no leakage from returning on the first failure since an
      //  attacker is just as able as us to verify the clients are not
      //  authorized; the public key is in the self-ident payload after all.)
      var foundClientWeAreTalkingTo = false;
      // the client must be authorized by the ident's longterm signing key
      var authorizedKeys = [
        this.personSelfIdentPayload.root.longtermSignPubKey];
      for (var iAuth = 0; iAuth < clientAuthBlobss.length; iAuth++) {
        var clientAuth = $keyops.assertCheckGetAttestation(
                           clientAuthsBlobs[iAuth], "client",
                           authorizedKeys);
        if (clientAuth.authorizedKey === this.arg.clientPublicKey)
          foundClientWeAreTalkingTo = true;
      }

      // - assert we are talking to one of the authorized clients
      // If we are not, then it is notable that someone had at least one valid
      //  client authorization to tell us about.  Since client authorizations
      //  are a private matter between a client and server, this constitutes
      //  a potential data leak.
      if (!foundClientWeAreTalkingTo)
        throw new $taskerrors.UnauthorizedUserDataLeakError();

      return this.personSelfIdentPayload;
    },
  },
});

var ProcessSignupTask = taskMaster.defineEarlyReturnTask({
  name: 'processSignup',
  steps: {
    /**
     * Ensure the request is well-formed/legitimate.
     */
    validateSignupRequest: function(arg) {
      return new ValidateSignupRequestTask(
        {msg: arg.msg, clientPublicKey: arg.conn.clientPublicKey,
         serverConfig: arg.conn.serverConfig}, this.log);
    },
    /**
     * Convey permanent failure if the request was not valid.
     */
    dealWithInvalidRequest: function(validSelfIdentPayload) {
      if (!validSelfIdentPayload) {
        return this.respondWithChallenge(CHALLENGE_NEVER);
      }
      this.selfIdentPayload = validSelfIdentPayload;
      return undefined;
    },
    checkForExistingAccount: function() {
      return this.arg.conn.serverConfig.authApi.serverCheckUserAccount(
               this.selfIdentPayload.root.rootSignPubKey);
    },
    verifyNoExistingAccount: function(hasAccount) {
      if (hasAccount)
        return this.respondWithChallenge(CHALLENGE_ALREADY_SIGNED_UP);
    },
    /**
     * Figure out what challenges could be used to authenciate this request.
     */
    determineChallenges: function() {
    },
    /**
     * If a challenge response is included, verify it is one of the ones we
     *  are allowing; if it is not, tell the client what is allowed.
     */
    checkOrGenerateChallenge: function() {
    },
  },
  impl: {
    respondWithChallenge: function(challengeType) {
      this.arg.conn.writeMessage({
        type: 'challenge',
        challenge: {
          mechanism: challengeType,
        },
      });
      this.arg.conn.close();
      return this.earlyReturn("root");
    }
  },
});

/**
 * Simple signup connection; most of the work is farmed out to
 *  `ProcessSignupTask` and its subsidiary tasks.
 */
function SignupConnection(conn) {
  this.conn = conn;
}
SignupConnection.prototype = {
  INITIAL_STATE: 'root',
  /**
   * Signup the user if they provided everything required, otherwise issue an
   *  appropriate set of challenges from which they can pick one to implement.
   *
   * @args[
   *   @param[msg ClientSignupBundle]
   * ]
   */
  _msg_root_signup: function(msg) {
    return new ProcessSignupTask(
      {msg: msg, conn: this.conn}, this.conn.log);
  },
};

exports.makeServerDef = function(serverConfig) {
  return {
    endpoints: {
      'signup/signup': {
        implClass: SignupConnection,
        serverConfig: serverConfig,
        authVerifier: function(endpoint, clientKey) {
          // (we have no identity on file)
          return true;
        },
      },
    },
  };
};

}); // end define
