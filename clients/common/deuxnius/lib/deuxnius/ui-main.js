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

define(
  [
    "wmsy/wmsy",
    "./unifile",
    "./pwomise",
    "./model/store",
    "./ui-pager",
    "./pages/peeps",
    "./pages/peep-conversations",
    "./pages/peep-convchat",
    "exports"
  ],
  function(
    $wmsy,
    $unifile,
    $pwomise,
    $store,
    $ui_pager,
    $ui_pages_peeps,
    $ui_pages_convs,
    $ui_pages_convchat,
    exports
  ) {

var wy = exports.wy = new $wmsy.WmsyDomain({id: "ui-main",
                                            domain: "deuxnius",
                                            clickToFocus: true});

var when = $pwomise.when;

wy.defineStyleBase("states", [
  ".statusText {",
  "  display: block;",
  "  font-family: sans-serif;",
  "  font-size: 200%;",
  "  text-align: center;",
  "}",
]);

wy.defineStyleBase("pages", [
  ".pageHeader {",
  "  display: block;",
  "  font-family: sans-serif;",
  "  font-size: 150%;",
  "  text-align: center;",
  "  background-color: lightblue;",
  "  border: 1px solid blue;",
  "  border-radius: 4px;",
  "  padding: 4px;",
  "}",
]);

wy.defineWidget({
  name: "app-root",
  constraint: {
    type: "app-root",
  },
  focus: wy.focus.domain.vertical("contents"),
  structure: {
    contents: wy.widget({type: "app-state"}, wy.SELF),
  },
  emit: ["gotoPage"],
  impl: {
    postInit: function() {
      // Tell the binding about us so it can tell us to update when it changes
      //  its state.
      this.obj.binding = this;
    },
    setPage: function(page) {
      this.emit_gotoPage("push", page);
    },
  },
});

wy.defineWidget({
  name: "app-state-probing",
  constraint: {
    type: "app-state",
    obj: { state: "probing" },
  },
  structure: {
    statusText: "Probing server...",
  },
  style: {
    statusText: ".statusText;",
  },
});

wy.defineWidget({
  name: "app-state-error",
  constraint: {
    type: "app-state",
    obj: { state: "error" },
  },
  structure: {
    statusText: "Something bad happened...",
    overview: wy.bind("message"),
  },
  style: {
    statusText: [
      ".statusText;",
      "color: red;",
    ],
  },
});

wy.defineWidget({
  name: "app-state-login",
  constraint: {
    type: "app-state",
    obj: { state: "login" },
  },
  focus: wy.focus.container.vertical("peeps"),
  structure: {
    loginLabel: "Who are you?",
    peeps: wy.vertList({type: "login-peep"}, "loginPeeps"),
  },
  events: {
    peeps: {
      command: function(peepBinding) {
        this.obj.loginAs(peepBinding.obj);
      },
    },
  },
});

wy.defineWidget({
  name: "login-peep",
  constraint: {
    type: "login-peep",
  },
  focus: wy.focus.item,
  structure: {
    email: wy.bind("email"),
  },
  style: {
    email: [
      "text-align: center;",
      "color: seagreen;",
    ],
  },
});


wy.defineWidget({
  name: "app-state-chewing",
  constraint: {
    type: "app-state",
    obj: { state: "chewing" },
  },
  structure: {
    statusText: "Processing messages...",
    progressText: [wy.bind("soFar"), " of ", wy.bind("total"), " messages."],
  },
});

/**
 * Drives the initial connection / setup process.
 */
function App(dataDirUrl) {
  this.dataDirUrl = dataDirUrl;

  this.state = "probing";
  this.binding = null;

  this.loginPeeps = null;
  this.fetchLoginCandidates();

  this.store = null;

  this.progressFunc = this._progressFunc.bind(this);
  this.soFar = 0;
  this.total = 0;
}
App.prototype = {
  _explode: function(why) {
    this.state = "error";
    this.message = why;

    this.update();
  },

  update: function() {
    if (this.binding)
      this.binding.update();
  },

  setPage: function(page) {
    if (this.binding) {
      this.binding.update();
      this.binding.setPage(page);
    }
  },

  _progressFunc: function(soFar, total) {
    this.soFar = soFar;
    this.total = total;
    if (this.binding)
      this.binding.update();
  },

  /**
   * Get the list of pretend users...
   */
  fetchLoginCandidates: function() {
    var self = this;
    when($unifile.list(this.dataDirUrl), function yay(files) {
      if (!files.length) {
        self._explode("Server has no login candidates for us...");
        return;
      }

      var peeps = self.loginPeeps = [];
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        peeps.push({email: file.name});
      }

      self.state = "login";
      self.update();
    }, function boo() {
      // (actually, unifile just resolves an empty list...)
      self._explode("Couldn't get data dir contents");
    });
  },

  /**
   * Point the importer at the login peep's directory.
   */
  loginAs: function(loginPeep) {
    this.store = new $store.Store(this.dataDirUrl, loginPeep.email);
    this.state = "chewing";
    this.update();

    var self = this;
    when(this.store.catchUp(this.progressFunc), function() {
      self.state = "pager";
      self.setPage({
        kind: "peeps",
        heading: "Peeps",
        contacts: self.store.gimmePeeps(),
      });
    });
  },
};

exports.main = function main() {
  var emitter = wy.wrapElement(document.getElementById("body"));

  var objRoot = new App("../../data");

  emitter.emit({type: "app-root", obj: objRoot});
};

}); // end define
