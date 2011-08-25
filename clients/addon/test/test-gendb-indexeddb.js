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

let testerUrl = $self.data.url("testing/logdriver.html");

function goRunTest(test, testName) {
  test.waitUntilDone(6 * 1000);
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
