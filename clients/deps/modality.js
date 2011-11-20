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

/*jslint strict: false, indent: 2 */
/*global define: false */

define(function (require) {

  var api = require('rdcommon/moda/api'),
      // we expose __moda for testing support
      bridge = document.__moda = new api.ModaBridge();

  // The hookup, using the custom event hack for jetpack,
  // updating to latest repo of jetpack may allow for going back
  // to postMessage. Right now testing with jetpack 1.1b1
  bridge._sendObjFunc = function (data) {
    var event = document.createEvent("MessageEvent");
    event.initMessageEvent('moda-ui-to-daemon', false, false,
                           JSON.stringify(data), '*', null, null, null);
    window.dispatchEvent(event);
  };

  // Listen for messages from the client daemon
  // NOTE: if changing this mechanism, you need to update the `devui.js`
  //  test helper that also listens for the event for testing purposes.
  window.addEventListener('moda-daemon-to-ui', function (evt) {
      //console.log('moda-content-message: ' + JSON.stringify(evt.data));
      var data = JSON.parse(evt.data);
      bridge._receive(data);
    }, false);

  return bridge;
});
