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
 *  objects like {selfIdent: BLOB} and JSON-encoded.  (Implementation note:
 *  I copy and paste them from Gnome Terminal.)
 */
exports.serverSelfIdents = [
{"selfIdent":"òGçy/w\u0013y§±Ëâi;ä}yM¥\u0018µÂ4ìñËÿq{\"tag\":\"server:full\",\"url\":\"ws://us.raindrop.it:80/\",\"meta\":{\"displayName\":\"Deuxdrop US Server\"},\"publicKey\":\"IÃ¨ÃÂ¡Ã¾>\\tÂÂJÃ!Ã§Ã¸ÃX\\u00035\\u0005rÂ©ÃÂ\\\\ÂjBX1Â²I\\u0010\",\"rootPublicKey\":\"rZPÃ®ÂÃ®(Â±Â¢Â´Ã'Ã8|o/[Â\\u000e}CÂiÃ\\u0002Ã½Ã{4\\u000b0\"}\"ýäz'tyÇÚ\u0005y\u00118ç:Ðãy h¸Á@\u0017\u0007\u0007"},
{"selfIdent":"u8W÷¤\\Shºx,\u0012\u0001á\u0007ÎÁ6ä¿ì«píVå%{\"tag\":\"server:full\",\"url\":\"ws://de.raindrop.it:80/\",\"meta\":{\"displayName\":\"Deuxdrop DE Server\"},\"publicKey\":\"ÃµNÂÂÃ¸Ã¡ÂpÃÃ§Â°ÂÂÃ°Â Ã¶Â£Ã£Â³Â½Ã·ÃÂ´Ã¸pKÂ·Ã\\u0014\\u0018[V\",\"rootPublicKey\":\"g\\\\\\u0012ÂÂBÃ©BJ\\u0017ÂÂ¡ÂÃ'NÃÂÂ½Ã³\\fÂ\\u000fÂ¶nÃ·o4ÃÂ¬m\\u0007\"}¡\u0003¿\u0018*05_#\u0003Oi!K3ÅÉb­ñïò\f(\u0006"},
{"selfIdent":"üQG2õmfÜC\u0018ªæ\u001e8å÷c\u0004¨¡PÆ«\u0017\u0003×\\\u0015F{\"tag\":\"server:full\",\"url\":\"ws://arrows.local:9876/\",\"meta\":{\"displayName\":\"asuth's Desktop Development Server\"},\"publicKey\":\"ÂÃº/6Â©MÂÂÃn: Ã¸ÃLÂ®\\u0006Â¸Ã·Ã¾ÂÂ­\\u0011-Â¯\\u0004&uGÂ:a\",\"rootPublicKey\":\"\\u0013\\u001co4Â02ÂeAÂ\\f$Â«Ã\\u0002\\u0006ÂÃ\\u0013Ã,\\u001c&{raÂµÃÃ·c*\"}\u0005P¹sF)Õ\u0018­@F¢\u0007¸\u0018\u0004\fxÇw\nbÚ\u000e­ê¾\u0007"},
{"selfIdent":"Ò²yMØþWJ¨¶1·£\u0007Ån|Ö&ýëí\"l+Ã/iv{\"tag\":\"server:full\",\"url\":\"ws://bwo.local:9876/\",\"meta\":{\"displayName\":\"Andrew's laptop development server\"},\"publicKey\":\"Â«Ã¯~IÃ¤z{ÃÂ¬bi]\\u000e(Ã¶\\u0016ÂÂ\\\\Â=\\u0005Ãº%\\r\\u0017Âº<\\u001aÃ¯b!\",\"rootPublicKey\":\"ÃÃÂ¶Ã²Ã¤ÂÃ2*Â¾Â¿Â°qÃÂ®Ã\\u0002\\u0014ÂÂ¸I4Â¨wÃ\\u000f-UÃ\\\\GÃ°\"}¦\u001cOR6\u0001²\u000eçA\u001eg\u001a\u000e>ì7\t`\u001bj\u0002+Ëý¤Ü\u000f"},
];

}); // end define
