/*
 * This file is just a shim that spins up the loggest test driver for the gendb
 *  unit test in a content page.
 */

let {Cc, Ci, Cu} = require('chrome');

let $runner = require('logdriverdriver');

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

exports.testIndexedDbGenDb = function(test) {
  authIndexedDBForUri($runner.testerUrl);
  $runner.goRunTest(test, 'rdctests/unit-gendb');
};
