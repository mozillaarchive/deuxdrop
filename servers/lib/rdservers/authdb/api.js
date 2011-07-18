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
 * Authorization DB API; we segregate use-cases so we can optimize for the
 *  differing record counts, access patterns, turnover, etc.
 *
 * XXX I believe my rationale for fusing a bunch of separate roles' db
 *  accesses together was that in the fullpub situation we might be able to
 *  benefit from reuse.  Namely, in some cases both the halfpub and the halfpriv
 *  bits want the same info (does this user have an account?) and so we can
 *  generically handle that in a common bit.  And in the cases where they
 *  don't want the same info, what the halfpub bit wants is basically a
 *  sanitized version of what the halfpriv knows, so in a fullpub configuration
 *  we could just ask the questions of the unsanitized data.
 * XXX Anywho, the point is this might want to be split out into more
 *  role-specific classes except for that which can totally be reused.  I am
 *  keeping things segregated so it's easy to do if we do it.
 **/

define(
  [
    'q',
    'rdcommon/crypto/keyops',
    'rdcommon/crypto/keyring',
    'rdcommon/crypto/pubring',
    'exports'
  ],
  function(
    $Q,
    $keyops,
    $keyring,
    $pubring,
    exports
  ) {
var when = $Q.when;

/**
 * Server agency representation of a user; holds a pubring and any private
 *  keyrings the user has endowed us with *which are required for the use
 *  case of this effigy*.  Specifically, we do not want to load keyrings
 *  that are not required by our use-case.
 *
 * XXX we do not update the list of client keys on-the-fly; this is okay
 *  because there is no way to dynamically authorize new clients, but we
 *  obviously need to make sure we take care of that.
 */
function UserEffigy(pubring, allClientKeys) {
  this.pubring = pubring;
  this.allClientKeys = allClientKeys;
}
UserEffigy.prototype = {
  get rootPublicKey() {
    return this.pubring.rootPublicKey;
  },
};

const BOX_PUB_KEYSIZE = $keyops.boxPublicKeyLength;

/**
 * User account by root key.
 */
const TBL_USER_ACCOUNT = "auth:userAccountByRootKey";
/**
 * User account by tell key; fastcheck it's our user.
 */
const TBL_USER_TELLKEY = "auth:userTellKey";
/**
 * Client authorizations by client key
 */
const TBL_CLIENT_AUTH = "auth:clientAuthByClientKey";

/**
 * Server auths; row is the server box key.
 */
const TBL_SERVER_AUTH = "auth:serverAuthByBoxKey";
/**
 * Server-user/server-converation auths from the perspective of our users.
 *  Row is composite of [server box key, our user key].  Chosen because the
 *  connections to servers provide inherent locality over the server key
 *  rather than (our) user locality.
 */
const TBL_SERVER_USER_AUTH = "auth:serverUserAuth";
/**
 * Conversation authorizations; row is the converation id, cell names are
 *  "u:SERVERKEY:USERKEY".  Locality is the conversation since things happening
 *  in a conversation will tend to be bursty.  Since conversation id's are
 *  randomish this will also tend to avoid hot-spots.
 */
const TBL_CONV_AUTH = "auth:convByConvId";

/**
 * Authorization/authentication/account stuff.
 *
 * XXX There is currently no deauthorization, which is clearly bad.
 */
function AuthApi(serverConfig, dbConn, _logger) {
  this._db = dbConn;

  this._db.defineHbaseTable(TBL_USER_ACCOUNT, ["d"]);
  this._db.defineHbaseTable(TBL_USER_TELLKEY, ["d"]);

  this._db.defineHbaseTable(TBL_CLIENT_AUTH, ["d"]);

  this._db.defineHbaseTable(TBL_SERVER_AUTH, ["s"]);
  this._db.defineHbaseTable(TBL_SERVER_USER_AUTH, ["u", "c"]);

  this._db.defineHbaseTable(TBL_CONV_AUTH, ["u"]);
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
    return this._db.boolcheckRowCell(
      TBL_USER_ACCOUNT, rootSignPubKey, "d:selfIdent");
  },

  serverGetUserAccountByTellKey: function(tellKey) {
    return this._db.getRowCell(TBL_USER_TELLKEY, tellKey, "d:rootKey");
  },

  /**
   * Create a user account for the given person and their clients to talk to us.
   *
   * XXX this should also describe the server roles they are signing up with us
   *  for.  (This may be defined by the self-ident blob, but we want higher
   *  levels to split that out for us and our consumers.)
   */
  serverCreateUserAccount: function(selfIdentPayload, selfIdentBlob,
                                    clientAuthsMap, storeKeyring) {
    var rootKey = selfIdentPayload.root.rootSignPubKey;

    var promises = [];
    var accountCells = {
      "d:selfIdent": selfIdentBlob,
      "d:store:keyring": storeKeyring,
    };
    for (var clientKey in clientAuthsMap) {
      accountCells["d:c:" + clientKey] = clientAuthsMap[clientKey];
      promises.push(
        this._db.putCells(TBL_CLIENT_AUTH, clientKey,
                          {"d:rootKey": rootKey}));
    }
    promises.push(
      this._db.putCells(TBL_USER_ACCOUNT, rootKey, accountCells));
    promises.push(
      this._db.putCells(TBL_USER_TELLKEY, selfIdentPayload.keys.tellBoxPubKey,
                        {"d:rootKey": rootKey}));
    return $Q.all(promises);
  },

  /**
   * Shallowly check if given client key is allowed to talk with us.  This is
   *  done by checking for the client auth in our db without crypto validation
   *  and without loading up the user account.
   */
  serverCheckClientAuth: function(clientPublicKey) {
    return when(
      this._db.getRowCell(TBL_CLIENT_AUTH, clientPublicKey, "d:rootKey"),
      this._serverCheckClientAuthCallback
      // passing through the rejection is fine
    );
  },
  _serverCheckClientAuthCallback: function(val) {
    return !!val;
  },

  serverFetchUserEffigyUsingRootKey: function(rootKey, serverRole,
                                              clientPublicKey) {
    return when(
      this._db.getRow(TBL_USER_ACCOUNT, rootKey, "d"),
      function(cells) {
        if (!cells.hasOwnProperty("d:selfIdent"))
          throw new Error("I am to be needing a selfIdent record");

        var pubring =
          $pubring.createPersonPubringFromSelfIdentDO_NOT_VERIFY(
            cells["d:selfIdent"]);

        var allClientKeys = [];
        for (var key in cells) {
          if (/^d:c:/.test(key))
            allClientKeys.push(key.substring(4));
        }

        var effigy = new UserEffigy(pubring, allClientKeys);

        // - envelope keyring (if we are mailstore)
        if (serverRole === "store" &&
            cells.hasOwnProperty("d:store:keyring")) {
          effigy.storeEnvelopeKeyring =
            $keyring.loadSimpleBoxingKeyring(cells["d:store:keyring"]);
        }

        return effigy;
      });
  },

  /**
   * Retrieve the information for a user account relevant to a specific server
   *  role given their client key.
   */
  serverFetchUserEffigyUsingClient: function(clientPublicKey, serverRole) {
    // get the user's root public key given the client key
    var self = this;
    return when(
      this._db.getRowCell(TBL_CLIENT_AUTH, clientPublicKey, "d:rootKey"),
      function(rootKey) {
        return self.serverFetchUserEffigyUsingRootKey(rootKey, serverRole,
                                                      clientPublicKey);
      }
      // passing through the rejection is fine
    );
  },

  /**
   * Retrieve the information for a user account relevant to a specific server
   *  role given their tell key.
   */
  serverFetchUserEffigyUsingTellKey: function(tellKey, serverRole) {
    var self = this;
    return when(this.serverGetUserAccountByTellKey(tellKey), function(rootKey) {
      return self.serverFetchUserEffigyUsingRootKey(rootKey, serverRole, null);
    });
  },

  //////////////////////////////////////////////////////////////////////////////
  // Inter-Server Auths
  //
  // All of this implies we are the maildrop server.

  /**
   * Check if the server is allowed to talk to this server (at all).
   *
   * Implies maildrop.
   */
  serverCheckServerAuth: function(otherServerBoxPubKey) {
    return when(
      this._db.getRowCell(TBL_SERVER_AUTH, otherServerBoxPubKey, "s:c"),
      this._serverCheckAuthCallback
      // passing through the rejection is fine
    );
  },
  _serverCheckAuthCallback: function(count) {
    if (!count || count <= 0)
      return false;
    return true;
  },

  /**
   * Mark the server as authorized; this should only be called by other methods
   *  on this class because a server being authorized is a function of the other
   *  higher level authorizations and we want to consolidate that bookkeeping in
   *  here.
   */
  _serverAuthorizeServer: function(otherServerBoxPubKey) {
    return this._db.incrementCell(TBL_SERVER_AUTH, otherServerBoxPubKey, "s:c",
                                  1);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Inter-User Authorizations
  //
  // Maildrop server implied.

  /**
   * Assert that the user (identified by their tell key) on the given server
   *  is authorized to talk to our user (identified by their root key).
   */
  userAssertServerUser: function(ourUserRootKey, otherServerBoxPubKey,
                                 otherUserTellBoxPubKey) {
    return this._db.assertBoolcheckRowCell(TBL_SERVER_USER_AUTH,
             otherServerBoxPubKey + ":" + ourUserRootKey,
             "u:" + otherUserTellBoxPubKey);
  },

  /**
   * From the perspective of one of our users (identified by their root key), is
   *  this an authorized conversation?
   */
  userAssertServerConversation: function(ourUserRootKey, otherServerBoxPubKey,
                                         conversationIdent) {
    return this._db.assertBoolcheckRowCell(TBL_SERVER_USER_AUTH,
             otherServerBoxPubKey + ":" + ourUserRootKey,
             "c:" + conversationIdent);
  },

  /**
   * Authorize a given user (identified by their tell key) on a given server to
   *  send our user messages.
   */
  userAuthorizeServerUser: function(ourUserRootKey, serverKey, userTellKey) {
    var cells = {};
    cells["u:" + userTellKey] = 1;
    return $Q.all([
      this._serverAuthorizeServer(serverKey),
      this._db.putCells(TBL_SERVER_USER_AUTH, serverKey + ":" + ourUserRootKey,
                        cells)
    ]);
  },
  /**
   * Authorize a server to send our user messages for a specific conversation.
   */
  userAuthorizeServerForConversation: function(ourUserRootKey, serverKey,
                                               convKey, whoSaysTellKey) {
    var cells = {};
    cells["c:" + convKey] = whoSaysTellKey;
    return $Q.all([
      this._serverAuthorizeServer(serverKey),
      this._db.putCells(TBL_SERVER_USER_AUTH, serverKey + ":" + ourUserRootKey,
                        cells)
    ]);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Conversation Authorizations
  //
  // Fanout server implied

  /**
   * Is the user in question, identified by their tell box key, authorized to
   *  participate in the given conversation?
   *
   * @return[@promise[Boolean]]
   */
  convAssertServerUser: function(convId, otherServerBoxPubKey,
                                 otherUserTellBoxPubKey) {
    return this._db.assertBoolcheckRowCell(TBL_CONV_AUTH, convId,
             "u:" + otherServerBoxPubKey + ":" + otherUserTellBoxPubKey);
  },

  _sortParticipants: function(a, b) {
    return a.i - b.i;
  },
  /**
   * Get the list of all participants, namely their tell box key and server,
   *  for a given conversation.  Participants are ordered by the order in which
   *  they were joined to the conversation.
   */
  convGetParticipants: function(convId) {
    var self = this;
    return when(this._db.getRow(TBL_CONV_AUTH, convId), function(cells) {
        // key is u:SERVERKEY:TELLKEY, both are boxing keys of known fixed
        //  length.
        var usersAndServers = [];
        for (var key in cells) {
          var serverKey = key.substring(2, 2 + BOX_PUB_KEYSIZE);
          var userTellKey = key.substring(
            2 + BOX_PUB_KEYSIZE + 1,
            2 + BOX_PUB_KEYSIZE + 1 + BOX_PUB_KEYSIZE);
          var userInfo = cells[key];
          usersAndServers.push({i: userInfo.i,
                                userTellKey: userTellKey,
                                userEnvelopeKey: userInfo.envelopeKey,
                                serverKey: serverKey});
        }
        // sort them by their order of addition
        usersAndServers.sort(self._sortParticipants);
        return usersAndServers;
      }
      // rejection pass-through is fine
    );
  },

  /**
   * Authorize a user, identified by their tell box key, to participate in the
   *  given conversation.
   *
   * Rejects if the user is already authorized; we do not provide race semantics
   *  so the caller must ensure they have serialized calls to this API.
   */
  convAuthorizeServerUser: function(convId, otherServerBoxPubKey,
                                    otherUserTellBoxPubKey,
                                    otherUserEnvelopeBoxPubKey) {
    var self = this;
    var columnName = "u:" + otherServerBoxPubKey + ":" + otherUserTellBoxPubKey;
    return when(this._db.boolcheckRowCell(TBL_CONV_AUTH, convId, columnName),
      function(curVal) {
        // reject if already authorized
        if (curVal)
          throw new Error("user already authorized"); // XXX better class wanted
        // authorize since not
        var cells = {};
        cells[columnName] = {
          // XXX this is not a super-great way to accomplish this.  it would
          //  be nice if we could use the cell's timestamp or something with
          //  with higher resolution, etc.
          // (where this = establish an ordering of addition without maintaining
          //  a separate counter; we should probably just use a counter.)
          i: Date.now(),
          envelopeKey: otherUserEnvelopeBoxPubKey
        };
        return $Q.all([
          self._serverAuthorizeServer(otherServerBoxPubKey),
          self._db.putCells(TBL_CONV_AUTH, convId, cells)
        ]);
      }
      // rejection pass-through is fine
    );
  },

  /**
   * Perform initial conversation authorization of multiple users.  Because this
   *  is the initial conversation, we do not perform any checking for prior
   *  authorizations like `convAuthorizeServerUser` does.  Additionally, because
   *  conversations can only be initiated by the starting user's own contacts,
   *  we do not need to perform any server authorization since it is guaranteed
   *  to already be authorized.
   *
   * @args[
   *   @param[convId]
   *   @param[serverUserInfos @listof[@dict[
   *     @key[tellKey]
   *     @key[envelopeKey]
   *     @key[serverKey]
   *   ]]]
   * ]
   */
  convInitialAuthorizeMultipleUsers: function(convId,
                                              recipServerUserInfos) {
    var cells = {};
    for (var i = 0; i < recipServerUserInfos.length; i++) {
      var info = recipServerUserInfos[i];
      cells["u:" + info.serverKey + ":" + info.tellKey] = {
        i: i,
        envelopeKey: info.envelopeKey,
      };
    }
    return this._db.putCells(TBL_CONV_AUTH, convId, cells);
  },

  //////////////////////////////////////////////////////////////////////////////
};

}); // end define
