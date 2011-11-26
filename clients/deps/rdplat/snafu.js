/**
 * Annoying platform-informed helpers.
 **/

define(
  [
    'exports'
  ],
  function(
    exports
  ) {

/**
 * Take the responseText from an XHR request and convert it to base64.
 */
exports.xhrResponseToBase64 = function(data) {
  return window.btoa(data);
};

exports.atob = window.atob.bind(window);

}); // end define
