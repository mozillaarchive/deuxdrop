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
  var os = '';
  for (var i = 0; i < data.length; i++) {
    os += String.fromCharCode(data.charCodeAt(i) & 0xff);
  }
  return window.btoa(os);
};

exports.atob = window.atob.bind(window);

}); // end define
