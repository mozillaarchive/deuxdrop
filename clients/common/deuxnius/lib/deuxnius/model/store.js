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
 * Lawnchair backed data storage.
 *
 * The general schema is as follows (move this elsewhere, refactor as needed):
 *
 * - Lawnchair "user" store:
 *   - id
 *   - display bundle {name, email}
 *   - pulled? (have we pulled down all the data for this user)
 *   - tag definitions
 *     - tag name
 *     - fundamental attributes:
 *       - good, neutral, bad
 *       - interesting, neutral, boring
 *       - friends, family, work
 *       - to-do, follow-up, defer
 *       - location, context
 *
 * - Lawnchair "contacts" store:
 *   (definitive stuff)
 *   - name
 *   - email addresses
 *   (user-assigned metadata)
 *   - tags
 *   (cached / derived stuff)
 *   - tags recently / frequently used to describe messages from this contact
 *   - list of personal conversations (1 on 1):
 *     - conversation id
 *     - conversation subject
 *     - list of participants
 *     - date of most recent message
 *     - conversation tags
 *   - list of small group conversations (2 other people)
 *   - list of larger scale conversations
 *
 * - Lawnchair "conversations" store:
 *   - tags (for conversation)
 *   - list of messages:
 *     - tags (per-message)
 *     - raw: as they come from the store
 **/

define(
  [
    "../pwomise",
    "./json-dump-importer",
    "exports"
  ],
  function(
    $pwomise,
    $importer,
    exports
  ) {

var USER_DB = "deuxnius_user";
var CONV_DB_PREFIX = "deuxnius_conv_";

function gimmeDB(name) {
  if ("google" in window) {
    return new Lawnchair({adaptor: "gears", name: name}, function() {});
  }
  else {
    return new Lawnchair({name: name}, function() {});
  }
}

function Store(baseUrl, username) {
  this.baseUrl = baseUrl;
  this.username = username;
  this.userDB = gimmeDB(USER_DB);
  this.convDB = gimmeDB(CONV_DB_PREFIX + this.username);

  this.importer = null;

  this.userDigest = null;
  this.convMap = null;
}
Store.prototype = {
  catchUp: function(progressFunc) {
    var deferred = this._catchupDeferred = $pwomise.defer("catchUp",
                                                          this.username);

    var self = this;
    this.userDB.get(this.username, function(udata) {
      if (udata && udata.allGood === $importer.REV) {
        self.userDigest = udata;
        self._chewDigest();
        self._catchupDeferred.resolve();
        return true;
      }

      self.importer = new $importer.DumpImporter(self,
                                                 self.username,
                                                 self.baseUrl + "/" +
                                                 self.username);
      return deferred.resolve(self.importer.go(progressFunc));
    });

    return deferred.promise;
  },

  beginTransaction: function() {
    this.userDB.beginBatch();
    this.convDB.beginBatch();
  },

  endTransaction: function() {
    this.convDB.endBatch();
    this.userDB.endBatch();
  },

  putUser: function(userObj) {
    userObj.key = this.username;
    this.userDB.save(userObj);

    this.userDigest = userObj;
    this._chewDigest();
  },

  putConv: function(convObj) {
    convObj.key = convObj.id;
    this.convDB.save(convObj);
  },

  _chewDigest: function() {
    // - create a conversation map
    var convMap = this.convMap = {};
    var convs = this.userDigest.convs;
    for (var i = 0; i < convs.length; i++) {
      convs[i].recent = new Date(convs[i].recent_ts);
      this.convMap[convs[i].id] = convs[i];
    }
    console.log("STORE good to go", this);
  },

  gimmePeeps: function() {
    return this.userDigest.privPeeps;
  },

  _sortRecentTsDesc: function(a, b) {
    return b.recent_ts - a.recent_ts;
  },

  gimmePrivConvsForPeep: function(peep) {
    var privConvs = [];
    for (var i = 0; i < peep.privConvIds.length; i++) {
      privConvs.push(this.convMap[peep.privConvIds[i]]);
    }
    privConvs.sort(this._sortRecentTsDesc);
    return privConvs;
  },

  // XXX refactor to be async even though the underlying dude is not.
  gimmeConvForDigest: function(convDigest) {
    var rval;
    function notreallyasync(val) {
      rval = val;
    }
    this.convDB.get(convDigest.id, notreallyasync);
    return rval;
  },

  emailBelongsToUser: function(email) {
    return email == this.username;
  },
};
exports.Store = Store;

}); // end define
