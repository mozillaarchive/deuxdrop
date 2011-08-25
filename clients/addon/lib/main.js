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

define([ 'exports', 'self', 'page-mod', 'page-worker', 'chrome',
         './jetpack-protocol/index'],
function (exports,   self,   pageMod,    pageWorkers,   chrome,
          protocol) {

  var Cu = chrome.Cu,
      jsm = {},
      data = self.data,

      // Set to the correct server host.
      serverHost = 'http://127.0.0.1:8888',

      url = data.url('addon/index.html'),
      aboutUrl = data.url('content/about.html'),
      transportUrl = data.url('web/firefox/transport.html'),
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

  function log(msg) {
    dump(msg + '\n');
  }

  //Uses Irakli's jetpack-protocol to register about:deuxdrop, but
  //concerned the url will not update correctly for state info with
  //about: URLs
  handler = protocol.about('dd', {
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
      include: ['about:dd'],
      contentScriptWhen: 'start',
      contentScriptFile: redirectorUrl,
      onAttach: function onAttach(worker) {
        worker.on('message', function (message) {
          worker.postMessage(url);
        });
      }
    });

log('SETTING UP PAGE MOD');
    pageMod.PageMod({
      include: [url],
      contentScriptWhen: 'start',
      contentScriptFile: modaContentUrl,
      onAttach: function onAttach(worker) {
        // start up the transport via a page mod.
        var pageWorkerReady = false,
            waiting = [],
            pageWorker;

        pageWorker = pageWorkers.Page({
          contentURL: transportUrl,
          contentScriptFile: modaContentUrl,
          //contentScript: 'sendContentMessage({serverHost: "' + serverHost + '"});',
          contentScriptWhen: 'ready',
          onMessage: function (message) {
            if (!pageWorkerReady && message.transportLoaded) {
              pageWorkerReady = true;
              if (waiting.length) {
                waiting.forEach(function (message) {
                  pageWorker.postMessage(message);
                });
              }
              waiting = [];
            } else {
              worker.postMessage(message);
            }
          }
        });

        // Listen to messages in the UI and send them to the transport via
        // the pageWorker.
        worker.on('message', function (message) {
log('RECEIVED UI MESSAGE: ' + JSON.stringify(message));
          if (pageWorkerReady) {
            pageWorker.postMessage(message);
          } else {
            waiting.push(message);
          }
        });
      }
    });
  };
});
