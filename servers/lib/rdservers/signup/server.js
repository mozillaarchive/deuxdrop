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
 **/

define(
  [
    'exports'
  ],
  function(
    exports
  ) {

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
 */
function SignupConnection(server, sock) {
}
SignupConnection.prototype = {
  _msg_init_newSignup: function(msg) {
  },
  _msg_init_completeSignup: function(msg) {
  },
};

exports.makeServerDefs
var SignupServerDef = {
  endpoints: {
    'signup/signup': {
      implClass: SignupConnection,
    },
  },
};

}); // end define
