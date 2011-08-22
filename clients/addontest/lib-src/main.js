
//Top level dependencies, to help inform r.js build process.
//define(function (require) {

console.log('IN MAIN');

    var chrome = require('chrome'),
        Cc = chrome.Cc,
        Ci = chrome.Ci,
        nsIIndexedDatabaseManager = Ci.nsIIndexedDatabaseManager,
        nsIIDBDatabase = Ci.nsIIDBDatabase;

console.log(typeof localStorage);

    //var idb = Cc["@mozilla.org/dom/indexeddb/manager;1"].getService(nsIIndexedDatabaseManager);
    //console.log('getUsageForURI: ' + idb.getUsageForURI);

    //var idb = Cc["@mozilla.org/dom/idbenvironment;1"].getService(nsIIDBDatabase);
    //console.log('getUsageForURI: ' + idb.createObjectStore);


    //require('common/test/unit-gendb');
//});
