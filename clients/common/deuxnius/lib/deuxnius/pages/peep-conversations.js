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
    "exports"
  ],
  function(
    $wmsy,
    exports
  ) {

var wy = exports.wy = new $wmsy.WmsyDomain({id: "page-peep-conversations",
                                            domain: "deuxnius",
                                            clickToFocus: true});

wy.defineIdSpace("conversation",
                 function (conv) { return conv.id; });

wy.defineWidget({
  name: "page-conversations",
  constraint: {
    type: "page",
    obj: { kind: "conversations" },
  },
  provideContext: {
    filterPeep: "filterPeep",
  },
  focus: wy.focus.container.vertical("convs"),
  structure: {
    header: "Conversations:",
    convs: wy.vertList({type: "conversation-summary-band"}, "conversations"),
  },
  style: {
  },
});

wy.defineWidget({
  name: "cite-peep",
  constraint: {
    type: "cite-peep",
  },
  structure: {
    name: wy.bind("name"),
  },
  style: {
    root: [
      "display: inline-block;",
    ],
  },
});


wy.defineWidget({
  name: "conversation-summary-band-generic",
  constraint: {
    type: "conversation-summary-band",
  },
  focus: wy.focus.item,
  idspaces: ["conversation"],
  emit: ["gotoPage"],
  structure: {
    unreadConvs: wy.bind("msgCount"),
    mainBit: {
      subject: wy.bind("subject"),
      participants: wy.widgetFlow({type: "cite-peep"}, wy.computed("otherPeeps"),
                                  {separator: ", "}),
    },
  },
  impl: {
    /**
     * Return the list of peeps who are not the user and not the user we are
     *  filtering on.
     */
    otherPeeps: function() {
      var other = [];
      var store = this.__context.store, filterPeep = this.__context.filterPeep;
      for (var email in this.obj.peepMap) {
        if (store.emailBelongsToUser(email))
          continue;
        if (email === filterPeep.email)
          continue;
        other.push(this.obj.peepMap[email]);
      }
      return other;
    },
  },
  events: {
    root: {
      command: function() {
        this.emit_gotoPage("push", {
          kind: "convchat",
          heading: this.obj.subject,
          conversation: this.__context.store.gimmeConvForDigest(this.obj),
        });
      },
    },
  },
  style: {
    root: {
      _: [
        "display: block;",
        "padding: 4px;",
        "border-bottom: 1px solid black;",
        "cursor: pointer;",
      ],
      ":hover": [
        "background-color: #eeeeee;",
      ],
    },
    subject: [
      "display: block;",
      "font-size: 140%;",
      "color: #3465a4;",
    ],
    email: [
      "display:block;",
    ],
    unreadConvs: [
      "clear: both;",
      "float: right;",
      "font-size: 150%;",
      "padding: 0.2em;",
    ],
  },
});


}); // end define
