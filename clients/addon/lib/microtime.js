/**
 * Mimic the node microtime module without actually providing the precision.
 *  Gecko doen't obviously surface any of its high resolution APIs to JS.  See
 *  https://bugzilla.mozilla.org/show_bug.cgi?id=539095
 */
exports.now = function() {
  return Date.now() * 1000;
};
