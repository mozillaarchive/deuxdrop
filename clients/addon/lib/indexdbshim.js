/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at:
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Mozilla Raindrop Code.
 *
 * The Initial Developer of the Original Code is
 *   The Mozilla Foundation
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Andrew Sutherland <asutherland@asutherland.org>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

/**
 * Now that we are requiring Firefox 9-targeted builds, we can directly
 *  access mozIndexedDB from the hidden window.
 *
 * Use a hidden-frame and massive trickery to get us access to MozIndexedDB in
 *  Firefox 6.  The 'trickery' is that
 *  https://bugzilla.mozilla.org/show_bug.cgi?id=681024 which was only landed
 *  on 2011/08/23 causes Chrome to be unable to get MozIndexedDB when using
 *  the system principal because it lacks a URI, so we need to provide a
 *  principal with a URI.
 **/

//let $hframe = require('hidden-frame'), $self = require('self');

let {Cc, Ci, Cu} = require('chrome');

let appShellService = Cc["@mozilla.org/appshell/appShellService;1"].
                        getService(Ci.nsIAppShellService);
let hiddenWindow = appShellService.hiddenDOMWindow;


var afterLoaded = [];

/*
function makeURI(aURL, aOriginCharset, aBaseURI) {
  var ioService = Cc["@mozilla.org/network/io-service;1"]
                  .getService(Ci.nsIIOService);
  return ioService.newURI(aURL, aOriginCharset, aBaseURI);
}
*/

let mozIndexedDB = hiddenWindow.mozIndexedDB,
    IDBTransaction = hiddenWindow.IDBTransaction,
    IDBKeyRange = hiddenWindow.IDBKeyRange;

/*
let mozIndexedDB = null,
    IDBTransaction = null, IDBKeyRange = null;
let gHiddenFrame = $hframe.add($hframe.HiddenFrame({
  onReady: function() {
    // now that we have a frame, point it at a URL so we get a principal...
    // (we can remove this step once the bug noted above is fixed; we could
    //  also potentially avoid the hidden frame and just grab it out of the
    //  hidden window itself or what not.)
    this.element.contentWindow.location = $self.data.url("blanky.html");
    let self = this;
    this.element.addEventListener("DOMContentLoaded", function() {
      let win = self.element.contentWindow;
      // forcibly provide the indexedDB permission.
      let permMgr = Cc["@mozilla.org/permissionmanager;1"]
                   .getService(Ci.nsIPermissionManager);
      let uri = makeURI(win.location, null, null);
      permMgr.add(uri,
                  "indexedDB",
                  Ci.nsIPermissionManager.ALLOW_ACTION,
                  Ci.nsIPermissionManager.EXPIRE_NEVER);

      console.log("PERM FOR", win.location, "is",
                  permMgr.testPermission(uri, "indexedDB"));

      try {
        opener = win.wrappedJSObject.gimmeDB;
        mozIndexedDB = win.mozIndexedDB;
        IDBTransaction = win.IDBTransaction;
        IDBKeyRange = win.IDBKeyRange;
      }
      catch(ex) {
        console.error("Problem getting mozIndexedDB!");
        console.exception(ex);
      }
      fireLoaded();
    }, true, true);
  }
}));
*/

function fireLoaded() {
 for (var i = 0; i < afterLoaded.length; i++) {
    afterLoaded[i](opener, mozIndexedDB, IDBTransaction, IDBKeyRange);
  }
  afterLoaded = null;
}

exports.afterLoaded = function(callback) {
  if (mozIndexedDB) {
    callback(mozIndexedDB, IDBTransaction, IDBKeyRange);
  }
  else {
    afterLoaded.push(callback);
  }
};
