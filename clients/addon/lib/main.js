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
 *   James Burke
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

/*jslint indent: 2, strict: false  */
/*global define: false */

/**
 * Starts the client daemon immediately and registers URLs so that as user
 *  interface tabs are opened we are able to establish a communications
 *  channel between the tabs and the daemon.
 *
 * The execution model is that the client daemon is expected to operate in the
 *  main chrome process (in a hidden frame), and the UI pages can operate in
 *  electrolysis content processes.  In theory the client daemon could also
 *  operate in a content process too if there is a way for us to get our djb
 *  nacl bindings exposed into it.
 *
 * We additionally provide a user interface to expose the logging data
 **/

const self = require('self'),
      pageMod = require('page-mod'),
      hiddenFrame = require('hidden-frame'),
      chrome = require('chrome'),
      nacl = require('nacl'),
      protocol = require('./jetpack-protocol/index'),
      $timers = require('timers');

var Cu = chrome.Cu, Cc = chrome.Cc, Ci = chrome.Ci,
    jsm = {},
    data = self.data,

    // - about:dd => Application URL redirector magic
    aboutUrl = data.url('content/about.html'),
    redirectorUrl = data.url('content/redirector.js'),

    // - Application UI
    // URL to what to actually present
    userInterfaceUrl = data.url('addon/index.html'),
    // URL for script overlay that provides message sending to the backside
    modaContentUrl = data.url('content/modaContent.js'),

    // - Development UI
    devInterfaceUrl = data.url('web/devui/content/index.html'),

    // - Log Viewing UI
    // View logs from the client daemon in-browser.
    logInterfaceUrl = data.url('web/logui/content/index.html'),

    // - Client Daemon (Backside) Logic
    // URL for the webpage that is the actual client/backside, servicing the UI
    clientDaemonUrl = data.url('web/firefox/clientdaemon.html'),

    uiRedirectorHandler, devUiRedirectorHandler, logUiRedirectorHandler,
    serverLogUiRedirectorHandler,
    Services, XPCOMUtils;


////////////////////////////////////////////////////////////////////////////////
// Privilege Granting

function makeURI(aURL, aOriginCharset, aBaseURI) {
  var ioService = Cc["@mozilla.org/network/io-service;1"]
                  .getService(Ci.nsIIOService);
  return ioService.newURI(aURL, aOriginCharset, aBaseURI);
}

// we totally need to perform this authorization step, otherwise things just
//  hang while it tries to display a prompt that no one will ever see.
function authIndexedDBForUri(url) {
  // forcibly provide the indexedDB permission.
  let permMgr = Cc["@mozilla.org/permissionmanager;1"]
                  .getService(Ci.nsIPermissionManager);
  let uri = makeURI(url, null, null);
  permMgr.add(uri,
              "indexedDB",
              Ci.nsIPermissionManager.ALLOW_ACTION,
              Ci.nsIPermissionManager.EXPIRE_NEVER);
}

////////////////////////////////////////////////////////////////////////////////
// Bookmarking

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

////////////////////////////////////////////////////////////////////////////////

function log(msg) {
  dump(msg + '\n');
}

//Uses Irakli's jetpack-protocol to register about:deuxdrop, but
//concerned the url will not update correctly for state info with
//about: URLs
uiRedirectorHandler = protocol.about('dd', {
  onRequest: function (request, response) {
    response.uri = aboutUrl;
  }
});
uiRedirectorHandler.register();

devUiRedirectorHandler = protocol.about('dddev', {
  onRequest: function (request, response) {
    response.uri = aboutUrl;
  }
});
devUiRedirectorHandler.register();

logUiRedirectorHandler = protocol.about('loggest', {
  onRequest: function (request, response) {
    response.uri = aboutUrl;
  }
});
logUiRedirectorHandler.register();

serverLogUiRedirectorHandler = protocol.about('loggest-server', {
  onRequest: function (request, response) {
    response.uri = aboutUrl;
  }
});
serverLogUiRedirectorHandler.register();


////////////////////////////////////////////////////////////////////////////////
// Client Daemon Moda Communication

var clientRegistry = {};
var gClientDaemonStarted = false, gClientHiddenFrame = null, gWinJS;

function notifyDaemonOfNewClient(senderUnique, uiWorker) {
  clientRegistry[senderUnique] = uiWorker;
  gWinJS.NEW_MODA_CLIENT(senderUnique);
}

function sendDaemonMessage(senderUnique, data) {
  gWinJS.MODA_CLIENT_MSG(senderUnique, data);
}

function notifyDaemonOfDeadClient(senderUnique) {
  gWinJS.DEAD_MODA_CLIENT(senderUnique);
}

function daemonSendClientMessage(clientUnique, data) {
  log('RECEIVED DAEMON MESSAGE: ' + JSON.stringify(data));
  clientRegistry[clientUnique].postMessage(data);
}

////////////////////////////////////////////////////////////////////////////////
// Client Daemon Logging Communication

var loggerClientRegistry = {};

function notifyDaemonOfNewLoggerClient(senderUnique, uiWorker, cannedDataUrl) {
  loggerClientRegistry[senderUnique] = uiWorker;
  gWinJS.NEW_LOG_CLIENT(senderUnique, cannedDataUrl);
}

function sendDaemonLoggerMessage(senderUnique, data) {
  gWinJS.LOG_CLIENT_MSG(senderUnique, data);
}

function notifyDaemonOfDeadLoggerClient(senderUnique) {
  gWinJS.DEAD_LOG_CLIENT(senderUnique);
}

function daemonSendLoggerClientMessage(clientUnique, data) {
  // These tend not to be huge and barely human readable, no more logging.
  //log('RECEIVED DAEMON LOGGER MESSAGE: ' + JSON.stringify(data));
  loggerClientRegistry[clientUnique].postMessage(data);
}


function daemonDemandServerUrl(callback) {
  callback(gWinJS.GIMME_TRANSIT_SERVER_URL());
}

////////////////////////////////////////////////////////////////////////////////
// Client Daemon Setup

function startClientDaemon() {
  // we need to authorize the worker page to use indexedDB:
  authIndexedDBForUri(clientDaemonUrl);

  gClientHiddenFrame = hiddenFrame.add(hiddenFrame.HiddenFrame({
    onReady: function() {
      // load our client daemon page into the frame
      this.element.contentWindow.location = clientDaemonUrl;

      var self = this;
      this.element.addEventListener("DOMContentLoaded", function() {
        // Now that it's loaded, provide it with any bindings it needs and
        //  start it up.
        var win = self.element.contentWindow,
            winjs = gWinJS = win.wrappedJSObject;

        // expose the crypto bindings
        winjs.$NACL = nacl;
        // expose the message transmission mechanism
        // (messaging also possible)
        winjs.daemonSendClientMessage = daemonSendClientMessage;

        winjs.daemonSendLoggerClientMessage = daemonSendLoggerClientMessage;

        // - trigger the load process
        // (we could alternately just use messaging if we weren't already
        //  poking and prodding.)
        winjs.BOOTSTRAP();
      }, true, true);
    }
  }));
}
startClientDaemon();

////////////////////////////////////////////////////////////////////////////////

var nextQuerySourceUniqueNum = 1;

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

  // - create the about:dd => application UI URL bouncer
  pageMod.PageMod({
    include: ['about:dd'],
    contentScriptWhen: 'start',
    contentScriptFile: redirectorUrl,
    onAttach: function onAttach(worker) {
      worker.on('message', function (message) {
        worker.postMessage(userInterfaceUrl);
      });
    }
  });

  // - create the about::dddev => dev UI URL bouncer
  pageMod.PageMod({
    include: ['about:dddev'],
    contentScriptWhen: 'start',
    contentScriptFile: redirectorUrl,
    onAttach: function onAttach(worker) {
      worker.on('message', function (message) {
        worker.postMessage(devInterfaceUrl);
      });
    }
  });

  pageMod.PageMod({
    include: ['about:loggest'],
    contentScriptWhen: 'start',
    contentScriptFile: redirectorUrl,
    onAttach: function onAttach(worker) {
      worker.on('message', function (message) {
        worker.postMessage(logInterfaceUrl);
      });
    }
  });

  // hack to be able to parameterize the loggest page given that the resource
  //  URI does not seem to want to be able to encode a hash or search query.
  var loggestStack = [];
  pageMod.PageMod({
    include: ['about:loggest-server'],
    contentScriptWhen: 'start',
    contentScriptFile: redirectorUrl,
    onAttach: function onAttach(worker) {
      worker.on('message', function (message) {
        daemonDemandServerUrl(function(url) {
          url = "http" + url.substring(2);
          loggestStack.push(url + "debuglog/gimme.json");
          worker.postMessage(logInterfaceUrl);
        });
      });
    }
  });


  // - use a pageMod to be able to bind to pages showing our app UI
  log('SETTING UP PAGE MOD');
  pageMod.PageMod({
    include: [userInterfaceUrl, devInterfaceUrl],
    contentScriptWhen: 'start',
    contentScriptFile: modaContentUrl,
    onAttach: function onAttach(uiWorker) {
      // (uiWorker is a jetpack abstraction that lets us send messages to the
      //  content page)

      // unique identifier to name the query source and provide the pairing
      //  for the moda API bridge.
      var uniqueNum = nextQuerySourceUniqueNum++;

      notifyDaemonOfNewClient(uniqueNum, uiWorker);

      // Listen to messages from the UI and send them to the client daemon
      uiWorker.on('message', function (message) {
        log('RECEIVED UI MESSAGE: ' + JSON.stringify(message));
        sendDaemonMessage(uniqueNum, message);
      });

      uiWorker.on('detach', function() {
        notifyDaemonOfDeadClient(uniqueNum);
      });
    },
  });

  // - use a pageMod to connect the logging UI
  // this uses a distinct bridge as exposed to the client daemon
  pageMod.PageMod({
    include: [logInterfaceUrl],
    contentScriptWhen: 'start',
    contentScriptFile: modaContentUrl,
    onAttach: function onAttach(uiWorker) {
      // (uiWorker is a jetpack abstraction that lets us send messages to the
      //  content page)

      // about:loggest-server magic.
      var remoteUrl = null;
      if (loggestStack.length)
        remoteUrl = loggestStack.pop();

      // unique identifier to name the query source and provide the pairing
      //  for the moda API bridge.
      var uniqueNum = nextQuerySourceUniqueNum++;

      notifyDaemonOfNewLoggerClient(uniqueNum, uiWorker, remoteUrl);

      // Listen to messages from the UI and send them to the client daemon
      uiWorker.on('message', function (message) {
        log('RECEIVED LOG UI MESSAGE: ' + JSON.stringify(message));
        sendDaemonLoggerMessage(uniqueNum, message);
      });

      uiWorker.on('detach', function() {
        notifyDaemonOfDeadLoggerClient(uniqueNum);
      });
    },
  });
};
