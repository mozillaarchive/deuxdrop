/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Deuxdrop.
 *
 * The Initial Developer of the Original Code is
 * Mozilla Messaging, Inc..
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 * */

/*jslint indent: 2, strict: false  */
/*global self: false, window: false */


/**
 * This is just a proxy to communicate with the addon-space code.
 */
var targetOrigin = window.location.protocol + '//' + window.location.host;

// self is an injected variable done by the add-on SDK
self.on('message', function (message) {
  console.log('modaContent onmessage: ' + message);
  console.log('modaContent msg: ' + window.wrappedJSObject.postMessage);
  console.log('modaContent targetOrigin: ' + targetOrigin);

  window.wrappedJSObject.postMessage('modaResponse:' + message, targetOrigin);
  console.log('finished forward');
});

window.addEventListener('message', function (evt) {
  if (evt.origin === targetOrigin && evt.data.indexOf('modaRequest:') === 0) {
    self.postMessage(evt.data.substring(12));
  }
}, false);
