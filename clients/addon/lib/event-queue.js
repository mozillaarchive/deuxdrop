var $timers = require('timers');

/*
 * Makes Q happy while also helping us catch exceptions that happen on its
 *  watch without getting into mozilla platform stuff too much.
 */

var caughtExceptions = [];

exports.enqueue = function(task) {
  $timers.setTimeout(function() {
    try {
      task();
    }
    catch(ex) {
      caughtExceptions.push(ex);
      // and re-throw it in case the platform can pick it up.
      throw ex;
    }
  }, 0);
};

exports.gimmeExceptions = function() {
  var result = caughtExceptions;
  caughtExceptions = [];
  return result;
};
