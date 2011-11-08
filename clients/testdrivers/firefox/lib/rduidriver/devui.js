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
 * Helper logic to drive the deuxdrop Development UI using WebDriver and verify
 *  the correct things are displayed.  This is intended to be invoked by higher
 *  level tests using the moda system state representation in order to be able
 *  to know what should be displayed by the UI.
 **/

define(
  [
    './webdriver',
    'exports'
  ],
  function(
    $webdriver,
    exports
  ) {

/**
 * Tab-wise, our approach is that:
 * - We always leave the root tab around as our means of getting at
 *    functionality.
 * - We always have one active 'page' at any given time, and we keep it alive
 *    until we explicitly move to a new page (or back to the root).
 *
 * The bits of our test where we are waiting for something to happen use an
 *  event-driven mechanism supported by built-in moda functionality.
 *  Specifically, moda will call a list of callbacks after receiving events
 *  across its bridge.  We use this to only check DOM state when something
 *  has changed.  We could also use wmsy's id namespace support to do something
 *  clever along these lines, but we don't expect all UIs to use wmsy, so we
 *  don't.
 */
function DevUIDriver() {
  this._activeTab = 'signup';
}
DevUIDriver.prototype = {
  showPage_possibleFriends: function() {
    // go to the root tab
    // hit the list possible friends button
    // wait for the tab to show up
  },

  showPage_peeps: function() {
  },

  showPage_connectRequests: function() {
  },

  showPage_peepConversations: function() {
  },


  act_approveConnectRequest: function() {
    // locate the connect request
    // click on it

    // this should pop up a new tab with details

    // confirm the connection
  },

  act_createConversation: function() {
    // go to the root tab
    // hit the create a conversation button

    // - add the peep(s)
    // hit add
    // locate the peep in the list
    // click the peep
    // verify the peep showed up

    // type in the message

    // hit send
  },
};

}); // end define
