/*
 * fake node-style shim for testdriver.js' benefit.
 */

var $file = require('file');

exports.readdirSync = function(path) {
  return $file.list(path);
};
