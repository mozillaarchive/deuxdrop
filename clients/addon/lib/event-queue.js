var $timers = require('timers');

exports.enqueue = function(task) {
  $timers.setTimeout(task, 0);
};
