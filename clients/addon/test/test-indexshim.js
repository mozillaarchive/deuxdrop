let $indexshim = require('indexdbshim');

exports.testEchoServer = function(test) {
  test.waitUntilDone(4 * 1000);
  $indexshim.afterLoaded(function(mozIndexedDB) {
    test.assertNotEqual(null, mozIndexedDB);
    console.log("my mozIndexedDB is", mozIndexedDB);
    test.done();
  });
};
