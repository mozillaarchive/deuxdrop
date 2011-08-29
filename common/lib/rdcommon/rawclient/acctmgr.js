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
 * Handles the persistence of the user's identity, currently using localStorage.
 **/

define(
  [
    'rdcommon/log',
    './api',
    'rdplat/gendb',
    'module',
    'exports'
  ],
  function(
    $log,
    $api,
    $gendb,
    $module,
    exports
  ) {

var ACCT_KEYNAME = 'deuxdrop-identity';

var gRawClient = null;

var AccountChangeListener = {
  accountChanged: function(rawClient) {
    localStorage[ACCT_KEYNAME] = JSON.stringify(rawClient.__persist());
  },
};

exports.loadAccount = function() {
  if (gRawClient)
    return gRawClient;

  var rootLogger = LOGFAB.account(null, null, []);

  var dbConn = $gendb.makeProductionDBConnection('', null, null, rootLogger);

  var persistedBlob = localStorage[ACCT_KEYNAME];
  if (persistedBlob) {
    gRawClient = $api.getClientForExistingIdentity(JSON.parse(persistedBlob),
                                                   dbConn, rootLogger);
  }
  else {
    var gibberishPoco = {
      displayName: null,
    };
    gRawClient = $api.makeClientForNewIdentity(gibberishPoco, dbConn,
                                               rootLogger);
    AccountChangeListener.accountChanged(gRawClient);
  }

  // now that we have the identity, we can update the root logger.
  rootLogger.__updateIdent(['account: ', gRawClient.rootPublicKey]);

  gRawClient.registerForAccountChangeNotifications(AccountChangeListener);
  return {
    rootLogger: rootLogger,
    rawClient: gRawClient,
    schema: $log.provideSchemaForAllKnownFabs(),
  };
};

var LOGFAB = exports.LOGFAB = $log.register($module, {
  /**
   * Root logger for the client; we create this mainly so we'll have something
   *  that can be parent to the database connection (which is created before
   *  the `RawClient`) and the `RawClient`.  In theory, the RawClient itself
   *  would be a better top-level, but it doesn't super matter.
   */
  account: {
    type: $log.DAEMON,
    subtype: $log.CLIENT,
    topBilling: true,
    semanticIdent: {
      _l0: null,
      userIdent: 'key:root:user',
    },
  }
});
}); // end define
