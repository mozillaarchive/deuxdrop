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

define([ 'exports', 'self', 'page-mod', 'Moda', 'chrome',
         'modaTransport', './jetpack-protocol/index'],
function (exports,   self,   pageMod,    Moda,   chrome,
          modaTransport, protocol) {

  var Cu = chrome.Cu,
      jsm = {},
      data = self.data,
      url = data.url('index.html'),
      aboutUrl = data.url('content/about.html'),
      redirectorUrl = data.url('content/redirector.js'),
      modaContentUrl = data.url('content/modaContent.js'),
      handler, Services, XPCOMUtils;


  // Load Services for dealing with bookmarking.
  Cu['import']("resource://gre/modules/Services.jsm", jsm);
  Cu['import']("resource://gre/modules/XPCOMUtils.jsm", jsm);
  Services = jsm.Services;
  XPCOMUtils = jsm.XPCOMUtils;

  // Extend Services object
  XPCOMUtils.defineLazyServiceGetter(
    Services, "bookmarks",
    "@mozilla.org/browser/nav-bookmarks-service;1",
    "nsINavBookmarksService"
  );


  //Uses Irakli's jetpack-protocol to register about:deuxdrop, but
  //concerned the url will not update correctly for state info with
  //about: URLs
  handler = protocol.about('deuxdrop', {
    onRequest: function (request, response) {
      response.uri = aboutUrl;
    }
  });
  handler.register();

  exports.main = function () {
/*
    // Set up a bookmark to deuxdrop. Another option is a custom
    // protocol handler, but that does not seem to get the URL structures
    // we want. But needs more exploration.
    var nsiuri = Services.io.newURI(url, null, null);
    if (!Services.bookmarks.isBookmarked(nsiuri)) {
      Services.bookmarks.insertBookmark(
        Services.bookmarks.unfiledBookmarksFolder,
        nsiuri,
        Services.bookmarks.DEFAULT_INDEX, 'Deuxdrop'
      );
    }
*/

    pageMod.PageMod({
      include: ['about:deuxdrop'],
      contentScriptWhen: 'start',
      contentScriptFile: redirectorUrl,
      onAttach: function onAttach(worker) {
        worker.on('message', function (message) {
          worker.postMessage(url);
        });
      }
    });

    pageMod.PageMod({
      include: [url],
      contentScriptWhen: 'start',
      contentScriptFile: modaContentUrl,
      onAttach: function onAttach(worker) {
        // Let the transport know there is listener now.
        worker.on('detach', function () {
          modaTransport.configAddOnWorker(null);
        });

        // Inform the transport the listener went away.
        modaTransport.configAddOnWorker(worker);
      }
    });
  };
});
