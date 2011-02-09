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
 * Processes a directory of JSON files from a web-server that provides Apache
 *  style index HTML output, slurping it into our persistable model.
 **/

define(
  [
    "../unifile",
    "../pwomise",
    "exports"
  ],
  function(
    $unifile,
    $pwomise,
    exports
  ) {

var when = $pwomise.when;

/**
 * Return true if the message is ridiculous and should be ignored.  Reasons:
 * - The subject is blank or just "RE:"
 */
function isDumbMessage(msg) {
  return (!msg.subject || msg.subject.trim().toLowerCase() == "re:");
}

var RE_RE = /^[Rr][Ee]:/;

exports.REV = 2;

function DumpImporter(store, email, url) {
  this.store = store;
  this.email = email;
  this.userDisplayName = null;
  this.url = url;
  this.progressFunc = null;

  this.iNextMsg = 0;
  this.messageUrls = null;

  this.convMap = {};
  this.nextConvId = 1;

  this.userDigest = null;
}
DumpImporter.prototype = {
  go: function(progressFunc) {
    this.progressFunc = progressFunc;

    var self = this;
    return when($unifile.list(this.url), function(msgUrls) {
      self.messageUrls = msgUrls;

      self.progressFunc(0, self.messageUrls.length);
      return self._chewNextMessage();
    }, null, "message list", this.url);
  },

  _chewNextMessage: function() {
    if (this.iNextMsg >= this.messageUrls.length) {
      this._finalize();
      return true;
    }

    if (this.iNextMsg % 10 == 0)
      this.progressFunc(this.iNextMsg, this.messageUrls.length);

    var self = this;
    return when($unifile.readFile(this.messageUrls[this.iNextMsg++]),
        function(contents) {
      if (contents)
        self._processMessageBlob(contents);
      return self._chewNextMessage();
    });
  },

  _processMessageBlob: function(msgStr) {
    var msg = JSON.parse(msgStr);

    if (isDumbMessage(msg))
      return;

    if (!this.userDisplayName &&
        msg.from.email == this.email)
      this.userDisplayName = msg.from.display;

    // - kill off quoted stuff assuming outlooky style quoting
    var idxQuoty = msg.body.indexOf("-----Original Message-----");
    if (idxQuoty != -1) {
      msg.body = msg.body.substring(0, idxQuoty);
    }

    // - thread by subject, ignoring RE:
    var normSubj;
    if (RE_RE.test(msg.subject))
      normSubj = msg.subject.substring(3).trim();
    else
      normSubj = msg.subject.trim();

    var conv;
    if (!this.convMap.hasOwnProperty(normSubj)) {
      conv = this.convMap[normSubj] = {
        id: this.nextConvId++,
        subject: normSubj,
        msgs: [],
        msgFlags: [],
        flags: {read: false, starred: false},
      };
    }
    else {
      conv = this.convMap[normSubj];
    }

    conv.msgs.push(msg);
    conv.msgFlags.push({read: false, starred: false});
  },

  _sortByDateAsc: function(a, b) {
    return b.date_ms - a.date_ms;
  },

  /**
   * Process a conversation to produce a summary to store on the user and with
   *  grouping info.
   */
  _persistAndMungeConv: function(conv) {
    conv.parties = 0;
    conv.peepMap = {};

    conv.msgs.sort(this._sortByDateAsc);

    // - populate the conversation's peepmap
    for (var iMsg = 0; iMsg < conv.msgs.length; iMsg++) {
      var msg = conv.msgs[iMsg];

      if (!(msg.from.email in conv.peepMap)) {
        conv.parties++;
        conv.peepMap[msg.from.email] = msg.from;
      }
      for (var iRecip = 0; iRecip < msg.recipients.length; iRecip++) {
        var recip = msg.recipients[iRecip];
        if (!(recip.email in conv.peepMap)) {
          conv.parties++;
          conv.peepMap[recip.email] = recip;
        }
      }
    }

    conv.oldest_ts = conv.msgs[0].date_ms;
    conv.recent_ts = conv.msgs[conv.msgs.length - 1].date_ms;

    // - update the global peepMap and privPeeps if this is privatey
    if (conv.parties < 5) {
      for (var email in conv.peepMap) {
        var name = conv.peepMap[email].name;

        var gpeep;
        if (!(email in this.peepMap)) {
          gpeep = this.peepMap[email] = {
            name: name,
            email: email,
            privCount: 0,
            unreadPrivCount: 0,
            oldest_ts: conv.oldest_ts,
            recent_ts: conv.recent_ts,
            privConvIds: [],
          };
          this.userDigest.privPeeps.push(gpeep);
        }
        else {
          gpeep = this.peepMap[email];
        }
        gpeep.privCount++;
        gpeep.unreadPrivCount++;
        gpeep.privConvIds.push(conv.id);
      }
    }

    this.store.putConv(conv);

    var digest = {
      id: conv.id,
      subject: conv.subject,
      parties: conv.parties,
      peepMap: conv.peepMap,
      msgCount: conv.msgs.length,
      oldest_ts: conv.oldest_ts,
      recent_ts: conv.recent_ts,
      flags: {
        read: conv.flags.read,
      },
    };
    this.userDigest.convs.push(digest);
  },

  _sortByRecentTsDesc: function(a, b) {
    return a.recent_ts - b.recent_ts;
  },

  /**
   * Finalize the gobbling process
   */
  _finalize: function() {
    this.peepMap = {};
    this.userDigest = {
      username: this.email,
      email: this.email,
      name: this.userDisplayName,
      convs: [],
      privPeeps: [],
      allGood: false,
    };

    // - munge conversations
    for (var normSubj in this.convMap) {
      var conv = this.convMap[normSubj];
      this._persistAndMungeConv(conv);
    }

    this.userDigest.privPeeps.sort(this._sortByRecentTsDesc);

    this.userDigest.allGood = exports.REV;

    this.store.putUser(this.userDigest);
  },
};
exports.DumpImporter = DumpImporter;

}); // end define
