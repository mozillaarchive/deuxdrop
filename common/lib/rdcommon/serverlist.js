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
 * Short-term stop-gap list of known server identities in the guise of their
 *  self-ident blobs.  This is used to pre-populate a list of known servers in
 *  the client.
 **/

define(
  [
    'exports'
  ],
  function(
    exports
  ) {

/**
 * The self-idents as found in the deuxdrop-server.selfident.json files saved
 *  into the servers' configuration directories.  These are just the blobs in
 *  objects like {selfIdent: BLOB} and JSON-encoded.
 */
exports.serverSelfIdents = [
{"selfIdent":"Ò²yMØþWJ¨¶1·£\u0007Ån|Ö&ýëí\"l+Ã/iv{\"tag\":\"server:full\",\"url\":\"ws://bwo.local:9876/\",\"meta\":{\"displayName\":\"Andrew's laptop development server\"},\"publicKey\":\"Â«Ã¯~IÃ¤z{ÃÂ¬bi]\\u000e(Ã¶\\u0016ÂÂ\\\\Â=\\u0005Ãº%\\r\\u0017Âº<\\u001aÃ¯b!\",\"rootPublicKey\":\"ÃÃÂ¶Ã²Ã¤ÂÃ2*Â¾Â¿Â°qÃÂ®Ã\\u0002\\u0014ÂÂ¸I4Â¨wÃ\\u000f-UÃ\\\\GÃ°\"}¦\u001cOR6\u0001²\u000eçA\u001eg\u001a\u000e>ì7\t`\u001bj\u0002+Ëý¤Ü\u000f"},
];

}); // end define
