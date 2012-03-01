// shim to provide a module that returns a usable XHR object.
// On the server, npm install xmlhttprequest
define(function (require, exports) {
    exports.XMLHttpRequest = XMLHttpRequest;
});
