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
 * The protocol by which the client talks to the message store.
 **/

define(
  [
    'exports'
  ],
  function(
    exports
  ) {

function StoreClientConnection() {
}
StoreClientConnection.prototype = {
  _msg_checkin_closeEnough: function(msg) {
  },

  _msg_checkin_needResync: function(msg) {
  },

  /**
   * Acknowledge message transmission has hit persistent storage and so should
   *  reliably be delivered (eventually).  This has nothing to do with whether
   *  it has made it to the recipient's maildrop, mailstore, device, or that the
   *  user has actually read the message.
   */
  _msg_root_ackSend: function(msg) {
  },

  _msg_root_convIndexData: function(msg) {
  },
  
  _msg_root_convMsgsData: function(msg) {
  },

  /**
   * Acknowledge a mutation command has hit persistent storage.
   */
  _msg_root_ackMutation: function(msg) {
  },
};

}); // end define
