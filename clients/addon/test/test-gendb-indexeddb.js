/*
 * This file is just a shim that spins up the loggest test driver for the gendb
 *  unit test in a content page.
 */

var $Q = require('q'), when = $Q.when,
    $td = require('rdcommon/testdriver'),
    $equeue = require('event-queue');

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

exports.testIndexedDbGenDb = function(test) {
  test.waitUntilDone(3 * 1000);

  when($td.runTestsFromModule('unit-gendb', DummyErrorTrapper, true),
    function() {
      test.pass("hooray");
      test.done();
    },
    function(err) {
      test.fail(err);
      test.done();
    });
};
