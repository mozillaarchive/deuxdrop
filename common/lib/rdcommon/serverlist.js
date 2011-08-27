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
{"selfIdent":"4o`­\u0001e)ýßãxõ!Æ{ÈÏË\u0006¨Â\u000f¢EèÂ\u001d{\"tag\":\"server:full\",\"url\":\"ws://dragonette.local:8001/\",\"meta\":{\"displayName\":\"A development server\"},\"publicKey\":\"ÂÃ,N\\u0018JÃ®p=Â¤^\\u001eÃ¤Â_F'AÂÃÂ¥ÃRA_Ã«Ã¢Ã¼Â¾LÂB\",\"rootPublicKey\":\"8Ã®Â\\r~\\tÃ1Ã²\\u0018\\u001f\\u001bÂ©*Â±\\u00175ÃÃÂEfÃ¶ÃQÂÃAm0ÂÂ±\"}nõ%þ]y\u0014å±n9ÎùÏRu'\\lÉk\u0005k°\u000bv\u0004"},
];

}); // end define
