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
/*global define: false */

define([ 'exports', 'self', 'widget', 'tabs', 'Moda'],
function (exports,   self,   widgets,  tabs,   Moda) {
  var data = self.data,
      url = data.url('index.html'),
      modaContentUrl = data.url('content/modaContent.js');

  // Listen for new tab opens, and if it lands on our URL, expose
  // moda to it.
  tabs.on('open', function (tab) {
    tab.on('ready', function (tab) {
      if (tab.url === url) {
        var worker = tab.attach({
          contentScriptFile: modaContentUrl,
          contentScriptWhen: 'start',
          onMessage: function (data) {
            console.log('main.js: ' + data);
            worker.postMessage(data + '+' + (new Date()).getTime());
          }
        }),
        moda = new Moda(worker);
      }
    });
  });

  exports.main = function () {
    // Create a widget to launch Deuxdrop
    widgets.Widget({
      id: 'deuxdrop-link',
      label: 'Deuxdrop',
      contentURL: 'http://www.mozilla.org/favicon.ico',
      onClick: function () {
        tabs.open(url);
      }
    });
  };
});
