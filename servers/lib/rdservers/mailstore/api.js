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

define(
  [
    'q',
    'rdcommon/log',
    'rdcommon/taskidiom', 'rdcommon/taskerrors',
    './uproc',
    'module',
    'exports'
  ],
  function(
    $Q,
    $log,
    $task, $taskerrors,
    $store_uproc,
    $module,
    exports
  ) {

var LOGFAB = exports.LOGFAB = $log.register($module, {
});

var taskMaster = $task.makeTaskMasterForModule($module, LOGFAB);


function MailstoreChooserApi(serverConfig, dbConn, _logger) {
  this._parentLogger = _logger;

  this.procRegistry = new $store_uproc.UserProcessorRegistry(serverConfig,
                                                             dbConn, _logger);
}
exports.Api = MailstoreChooserApi;
MailstoreChooserApi.prototype = {
  /**
   * If the user is using us as a fullpub, we pass the message directly to our
   *  mailstore layer; if not, we queue the message for pickup by the user
   *  (which could potentially get fast-pathed if their mailstore is currently
   *  connected).
   *
   * XXX right now we are assuming fullpub and directly embedding the
   *  processing.
   * XXX furthermore, we are immediately processing, which can result in races,
   *  versus using a processing queue to enforce serialized processing.  This
   *  is reasonably safe in our unit testing model but not remotely a good idea
   *  for anything approaching reality.
   *
   * In all cases we should be receiving a message boxed to the user's envelope
   *  key
   *
   * @args[
   *   @param[type @oneof["fanout" "user"]]
   *   @param[userTellPubKey]
   *   @param[boxedMessage]
   *   @param[nonce]
   *   @param[senderKey]{
   *     If the sender is a user, their tell key; if the sender is a (fanout)
   *     server, the server's public box key.
   *   }
   * ]
   */
  convMessageForUser: function(stransitEnv, otherServerKey) {
    return this.procRegistry.convMessageForUser(stransitEnv, otherServerKey);
  },
};

}); // end define
