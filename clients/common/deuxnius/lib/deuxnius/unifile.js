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
 * The Original Code is Mozilla Messaging Code.
 *
 * The Initial Developer of the Original Code is
 *   The Mozilla Foundation
 * Portions created by the Initial Developer are Copyright (C) 2010
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
 * Unified file interface; lets us enumerate the contents of web and local
 *  directories and get their contents.
 **/

define(
  [
    "exports",
    "./pwomise",
  ],
  function (
    exports,
    pwomise
  ) {

// apache always uses "
var RE_LINK = /href="([^\"]+)"/g;

function WebFile(aBasePath, aName, aIsDir) {
  this._base = aBasePath;
  this.name = aName;
  this.isDir = aIsDir;
}
WebFile.prototype = {
  toString: function() {
    return this.name + (this.isDir ? "/" : "");
  }
};

/**
 * List the contents of a web directory by hitting the page, hoping it's an
 *  index, and treating all relative links observed as children of that
 *  directory.  If there is a trailing slash, we presume it to be a directory,
 *  otherwise a file.  Links that start with "?" are presumed to be sorting
 *  magic or what have you.
 *
 * This is intended to handle apache's mod_autoindex output and nothing else:
 *  http://httpd.apache.org/docs/2.2/mod/mod_autoindex.html
 *
 * It would be neat to support other things in the future, but it's not a
 *  concern right now.
 */
function webList(aPath, XHRImpl) {
  var deferred = pwomise.defer("webList", aPath);
  var req = new (XHRImpl || XMLHttpRequest)();
  req.open("GET", aPath, true);
  req.addEventListener("load", function() {
    if (req.status != 200) {
      deferred.resolve([]);
      return;
    }

    var match;
    var things = [];
    while ((match = RE_LINK.exec(req.responseText))) {
      var link = match[1];
      if (!link.length || link[0] === "?" || link[0] === "/" ||
          link[0] === "." || link.indexOf("//") != -1)
        continue;
      // After that comprehensive and absolutely infallible set of heuristics,
      //  we must be looking at a relative link.
      var isDir = false;
      if (link[link.length - 1] === "/") {
        isDir = true;
        link = link.substring(0, link.length - 1);
      }
      things.push(new WebFile(aPath, link, isDir));
    }
    deferred.resolve(things);
  }, false);
  req.send(null);
  return deferred.promise;
}

var RE_HTTP = /^http[s]?:\/\//;

function LocalFile(aFullPath) {
}
LocalFile.prototype = {
  get isDir() {

  }
};

exports.normFile = function(aPathy) {

};

exports.list = function(aPath, XHRImpl) {
  //if (RE_HTTP.test(aPath)) {
    return webList(aPath, XHRImpl);
  //}
  //return file.list(aPath);
};

exports.readFile = function(aPathOrWebFile, XHRImpl) {
  if (aPathOrWebFile instanceof WebFile) {
    aPathOrWebFile = aPathOrWebFile._base + "/" + aPathOrWebFile.name;
  }

  var deferred = pwomise.defer("readFile", aPathOrWebFile);
  var req = new (XHRImpl || XMLHttpRequest)();
  req.open("GET", aPathOrWebFile, true);
  req.addEventListener("load", function() {
    if (req.status != 200) {
      deferred.resolve(null);
      return;
    }

    deferred.resolve(req.responseText);
  }, false);
  req.send(null);
  return deferred.promise;
};

exports.listMatchingDescendants = function(aPath) {

};

}); // end define
