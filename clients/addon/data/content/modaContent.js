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
/*global self: false, window: false, document: false, postMessage: false */


/**
 * This is just a proxy to communicate with the addon-space code.
 */
var targetOrigin = window.location.protocol + '//' + window.location.host,
    modaRequest = 'modaRequest:',
    modaResponse = 'modaResponse:';

// Going with a custom event approach  as mentioned by Irakli instead of
// postMessage because of this bug:
// https://bugzilla.mozilla.org/show_bug.cgi?id=666547
// Once that is fixed, go back to approach where
// self.on('message') is used to get messages from addon and uses
// window.postMessage to ferry them to content.
// window.addEventListener() is used to get content messages, and it
// uses self.postMessage to ferry to addon-space.

// self is an injected variable done by the add-on SDK

function sendContentMessage(data) {
  console.log('modaContent.js: ' + unsafeWindow.location.href + ', sending moda-content-message: ' + JSON.stringify(data));
  postMessage(modaResponse + JSON.stringify(data), targetOrigin);
  /*
  console.log('modaContent.js: ' + unsafeWindow.location.href + ', sending moda-content-message: ' + JSON.stringify(data));
  var event = document.createEvent('MessageEvent');
  event.initMessageEvent('moda-content-message', false, false, JSON.stringify(data),
                         '*', null, null, null);
  window.dispatchEvent(event);
  */
}

window.addEventListener('message', function (evt) {
  if (evt.origin === targetOrigin && evt.data.indexOf('modaRequest:') === 0) {
    console.log('modaContent.js: ' + unsafeWindow.location.href + ', sending moda-addon-message to addon: ' + evt.data);
    var data = JSON.parse(evt.data.substring(modaRequest.length));
    self.postMessage(data);
  }
}, false);

/*
window.addEventListener('moda-addon-message', function (event) {
  console.log('modaContent.js: ' + unsafeWindow.location.href + ', sending moda-addon-message to addon: ' + event.data);
  self.postMessage(JSON.parse(event.data));
}, false);
*/

self.on('message', function (data) {
  sendContentMessage(data);
});

/*
self.on('message', function (message) {
  console.log('modaContent onmessage: ' + message);
  console.log('modaContent msg: ' + unsafeWindow.postMessage);

  unsafeWindow.postMessage('modaResponse:' + message, targetOrigin);
  console.log('finished forward');
});

window.addEventListener('message', function (evt) {
  if (evt.origin === targetOrigin && evt.data.indexOf('modaRequest:') === 0) {
    self.postMessage(evt.data.substring(12));
  }
}, false);
*/
