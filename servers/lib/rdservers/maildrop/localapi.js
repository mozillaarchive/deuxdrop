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
 * Local API for:
 * - A mailstore co-located with a maildrop.
 * - The fanout server, which is always co-located with a maildrop.
 *
 * The remote API is for when the mailstore is talking with a remote maildrop.
 **/

define(
  [
    'q',
    'exports'
  ],
  function(
    $Q,
    exports
  ) {

/**
 * Local maildrop API.  A maildrop does not keep attestations around; in the
 *  event the set of authorizations becomes suspect, they should be regenerated
 *  by the mailstore from its attestations.
 *
 * This class is pretty much a pass-through to the authentication API right now,
 *  but the remote variant obviously will do more (but do the same thing once
 *  it receives the messages).
 */
function MaildropLocalApi(serverConfig, dbConn, _logger) {
  this._authApi = serverConfig.authApi;
}
exports.Api = MaildropLocalApi;
MaildropLocalApi.prototype = {
  //////////////////////////////////////////////////////////////////////////////
  // Authorization

  /**
   * Authorize a user known to us by their tellBoxPubKey to send messages to
   *  our user with the given root public key or join them to conversations.
   *
   * This also implicitly creates an authorization for the other server to talk
   *  to us.
   */
  authorizeServerUserForContact: function(ourUserRootPubKey,
                                          serverBoxPublicKey,
                                          otherUserTellBoxPubKey) {
    return this._authApi.userAuthorizeServerUser(
      ourUserRootPubKey, serverBoxPublicKey, otherUserTellBoxPubKey);
  },

  /**
   * Authorize a server('s fanout daemon) to send our user a messages with the
   *  given conversation id.
   *
   * This also implicitly creates an authorization for the other server to talk
   *  to us.
   */
  authorizeServerForConversation: function(ourUserRootPubKey,
                                           serverBoxPublicKey,
                                           convId) {
    return this._authApi.userAuthorizeServerForConversation(
      ourUserRootPubKey, serverBoxPublicKey, convId);
  },

  //////////////////////////////////////////////////////////////////////////////
};

}); // end define
