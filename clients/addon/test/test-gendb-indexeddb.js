/*
 * This file is just a shim that spins up the loggest test driver for the gendb
 *  unit test in a content page.
 */

/**
 * The ErrorTrapper as provided in `cmdline.js` is our gateway to RequireJS'
 *  error trapping capabilities.  We don't have/use such capabilities in
 *  jetpack at this time.
 */
var DummyErrorTrapper = {
  callbackOnError: function() {},
  gobbleAndStopTrappingErrors: function() {
    return $equeue.gimmeExceptions();
  },

  reliableOutput: function(msg) {
    dump(msg + "\n");
  },

  on: function() {},
  once: function() {},
  removeListener: function() {},
};

let $pworker = require('page-worker'), $self = require('self');

let {Cc, Ci, Cu} = require('chrome');

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

  console.log("PERM FOR", url, "is",
              permMgr.testPermission(uri, "indexedDB"));
}

let testerUrl = $self.data.url("testing/logdriver.html");

function goRunTest(test, testName) {
  test.waitUntilDone(6 * 1000);
  authIndexedDBForUri(testerUrl);
  var page = $pworker.Page({
    contentURL: testerUrl + "?" + testName,
    onMessage: function(msg) {
      if (msg === "pass")
        test.pass();
      else
        test.fail();
      test.done();
      page.destroy();
    },
  });
}

exports.testIndexedDbGenDb = function(test) {
  goRunTest(test, 'rdctests/unit-gendb');
};
