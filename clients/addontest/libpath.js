define(function (require) {
  //url is a
  var url = require('api-utils/url');

  return {
    resolve: function (path) {
      return url.toFilename(path);
    }
  }
});
