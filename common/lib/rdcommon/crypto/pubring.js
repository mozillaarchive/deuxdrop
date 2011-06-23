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
 * Public-only keyring representation; they track the known public keys and
 *  their relationships for an external entity.  This is used to hide the
 *  implementation details of authorization chains.
 *
 * Currently this is only done for "person"s and not servers because the
 *  person key situation is (intentionally) much more complicated.
 **/

define(
  [
    'exports'
  ],
  function(
    exports
  ) {

function PersonPubring(persistedBlob) {
}
PersonPubring.prototype = {
  /**
   * Assert that the longterm signing public key was valid for this person at
   *  the given timestamp, throwing an exception if the key is either unknown
   *  to us or is not valid for the given timestamp.
   *
   * The timestamp is required in all cases.  Ideally the timestamp at which
   *  something was received by a (trusted) node will be persisted with the
   *  data so we can use that timestamp to validate the data.  This avoids
   *  weird semantics where data starts expiring out from under an application
   *  in nonsensical ways.
   */
  assertValidLongtermSigningKey: function(longtermSignPubKey, timestamp) {
  },
};

exports.createPersonPubringFromSelfIdent = function() {

};

exports.loadPersonPubring = function(persistedForm) {
};

}); // end define
