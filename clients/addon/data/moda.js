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
/*global window: false, document: false */

var origin = window.location.protocol + '//' + window.location.host;

var moda = {
  transport: function (message) {
    var event = document.createEvent("MessageEvent");
    event.initMessageEvent('addon-message', false, false, JSON.stringify(message), '*', null,
                           null, null);
    window.dispatchEvent(event);
    //need bug fix for 666547 before switching to:
    //window.postMessage('modaRequest:' + message, origin);
  }
};

window.addEventListener('content-message', function (evt) {
  var data = JSON.parse(evt.data),
      div = document.createElement('div');

  div.innerHTML = data;
  div.style.backgroundColor = 'red';
  document.body.appendChild(div);

  //console.log('moda.js on message: ' + evt + ', evt.data: ' + data);
}, false);

//need bug fix for 666547 before switching to:
/*
window.addEventListener('message', function (evt) {
  //alert('here: ' + evt.data);
  var div = document.createElement('div');
    div.innerHTML = evt.data;
    div.style.backgroundColor = 'red';
    document.body.appendChild(div);

  console.log('moda.js on message: ' + evt + ', evt.data: ' + evt.data);
  if (evt.origin === origin && evt.data.indexOf('modaResponse:') === 0) {
    var div = document.createElement('div');
    div.innerHTML = evt.data;
    document.body.appendChild(div);
  }
}, false);
*/
