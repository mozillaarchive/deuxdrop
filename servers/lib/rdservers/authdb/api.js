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
 * Authorization API; we segregate use-cases so we can optimize for the
 *  differing record counts, access patterns, turnover, etc.
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
var when = $Q.when;

const TBL_USER_ACCOUNT = "auth:userAccountByRootKey";
const TBL_CLIENT_AUTH = "auth:clientAuthByClientKey";

function AuthApi(dbConn) {
  this._db = dbConn;

  this._db.defineHbaseTable(TBL_USER_ACCOUNT, ["d"]);
  this._db.defineHbaseTable(TBL_CLIENT_AUTH, ["d"]);
}
exports.AuthApi = exports.Api = AuthApi;
AuthApi.prototype = {
  //////////////////////////////////////////////////////////////////////////////
  // User Accounts (on this server)

  /**
   * Check if the user has an account with us.
   *
   * @args[
   *   @param[rootSignPubKey]
   *   }
   * ]
   */
  serverCheckUserAccount: function(rootSignPubKey) {
    // no errback, let the outage exception propagate.
    return when(
      this._db.getRowCell(TBL_USER_ACCOUNT, rootSignPubKey, "d:selfIdent"),
      this._serverCheckUserAccountCallback);
  },
  _serverCheckUserAccountCallback: function(val) {
    return val !== null;
  },

  serverCreateUserAccount: function(rootSignPubKey, selfIdentBlob,
                                    clientAuthsMap) {
    var promises = [];
    var accountCells = {
      "d:selfIdent": selfIdentBlob,
    };
    for (var clientKey in clientAuthsMap) {
      accountCells["d:c:" + clientKey] = clientAuthsMap[clientKey];
      promises.push(
        this._db.putCells(TBL_CLIENT_AUTH, clientKey, rootSignPubKey));
    }
    promises.push(
      this._db.putCells(TBL_USER_ACCOUNT, rootSignPubKey, accountCells));
    return $Q.wait.apply(null, promises);
  },

  serverCheckClientAuth: function(clientPublicKey) {
    return when(
      this._db.getRow(TBL_CLIENT_AUTH, clientPublicKey, "d"),
      this._serverCheckClientAuthCallback);
  },
  _serverCheckClientAuthCallback: function(val) {
    return val !== null;
  },

  //////////////////////////////////////////////////////////////////////////////
  // Inter-Server Auths

  /**
   * Check if the server is allowed to talk to this server (at all).
   */
  serverCheckServerAuth: function(otherServerIdent) {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Inter-User Authorizations

  /**
   * From the perspective of one of our users, have they authorized the other
   *  user for a given privilege?  For now, there is only one privilege,
   *  "contact".
   */
  userCheckUserPrivilege: function(ourUserIdent, otherUserIdent, privilege) {
  },

  /**
   * From the perspective of one of our users, is this an authorized
   *  conversation?
   */
  userCheckConversation: function(ourUserIdent, conversationIdent) {
  },

  userAuthorizeServerForContact: function(ourUserIdent, otherServerIdent) {
  },
  userAuthorizeServerForConversation: function(ourUserIdent, convIdent,
                                               attestation) {
  },

  //////////////////////////////////////////////////////////////////////////////
};

}); // end define
