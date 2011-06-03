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
 * Responsible for setting / clearing authorizations for inter-server and
 *  inter-user communication.
 *
 * ## hbase data model: incoming inter-server auths
 * - row: [server key]
 * - column family: "c": for fast checking; can be rebuilt as needed from "d"
 *   - "primary": the current tally for authorizations by local users for
 *      receipt of messages from that server.
 *   - "secondary": the current tally for authorizations by the authorized
 *      contacts of local users.  So if my friend is on another server and is
 *      adding me to a conversation on a third server, he can proffer a
 *      secondary authorization.
 * - column family: "p": for primary details
 *   - "k:#...": the public id of our user => the attestation
 * - column family: "s": for secondary details
 *   - "k:#...:#...": the public id of the local user, the public id of their
 *      friend who is requesting the auth => the attestation which also
 *      includes the local user the attestation is dependent upon.
 *
 * ## hbase data model: inverted incoming inter-server auths:
 * - row: [user key]
 * - column family: "p": primary auths they have made.
 *   - "k:#...": server key they attested for => attestation
 * - column family: "s": secondary auths made on their behalf
 *   - "k:#...:#...": the public id of the server, the public id of the friend
 *       who is requesting the auth => the attestation.
 *
 * ## hbase data model: incoming user auths
 * - row [user key, friend key]
 * - column family: "a"
 *   - "a": The attestation.
 **/

define(
  [
    'exports'
  ],
  function(
    exports
  ) {

}); // end define
