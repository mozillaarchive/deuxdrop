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

var wy = exports.wy = new $wmsy.WmsyDomain({id: "page-peep-convchat",
                                            domain: "deuxnius",
                                            clickToFocus: true});

wy.defineStyleBase("convchat", [
  ".messageFrom {",
  "}",
  ".messageTo {",
  "}",
  ".message {",
  "}",
]);

// XXX we don't have a proper unique identifier on messages for this rep!
// (But the timestamp is sufficiently unique for the page...)
wy.defineIdSpace("convmsg",
                 function (convmsg) { return convmsg.date_ms; });

wy.defineWidget({
  name: "page-convchat",
  constraint: {
    type: "page",
    obj: { kind: "convchat" },
  },
  focus: wy.focus.container.vertical("messages"),
  structure: {
    messages: wy.vertList({type: "message-band"}, ["conversation", "msgs"]),
  },
  style: {
    root: [
      "padding: 6px;",
    ],
  },
});

wy.defineWidget({
  name: "smart-date",
  constraint: {
    type: "smart-date",
  },
  structure: {
    rep: "",
  },
  impl: {
    postInit: function() {
      this.date = new Date(this.obj);

      this.rep_element.textContent = this.date.toLocaleDateString() + " " +
                                     this.date.toLocaleTimeString();
    },
  },
  style: {
    root: [
      "display: inline-block;",
    ],
  },
});

var COMPRESS_MULTI_NEWLINE = /\n(?:[ \t]*\n){2,}/g;

wy.defineWidget({
  name: "message-band-generic",
  constraint: {
    type: "message-band",
  },
  focus: wy.focus.item,
  idspaces: ["convmsg"],
  structure: wy.block({
    date: wy.widget({type: "smart-date"}, "date_ms"),
    author: wy.bind(["from", "name"]),
    body: wy.computed("mungedBody"),
    arrowBorder: "",
    arrow: "",
  }, {dir: wy.computed("dir")}),
  impl: {
    dir: function() {
      return this.__context.store.emailBelongsToUser(this.obj.from.email) ?
        "from" : "to";
    },
    mungedBody: function() {
      return this.obj.body.trim().replace(COMPRESS_MULTI_NEWLINE, "\n\n");
    },
  },
  events: {
  },
  style: {
    root: {
      _: [
        "position: relative;",
        "box-shadow: 0 1px 2px #CCE0FF;",
        "margin: 5px 0px;",
        "padding: 10px 20px;",
        "background-color: white;",
        "border: 1px solid #BEBEBE;",
        "border-radius: 5px;",
      ],
      '[dir="from"]': {
        _: [
          "float: left;",
        ],
        author: [
          "color: #FF5959;",
        ],
        arrow: [
          "border-width: 20px 20px 0px 0px;",
          "left: 20px;",
        ],
        arrowBorder: [
          "border-width: 22px 22px 0px 0px;",
          "left: 19px;",
        ],
      },
      '[dir="to"]': {
        _: [
          "float: right;",
        ],
        author: [
          "color: #008EED;"
        ],
        arrow: [
          "border-width: 20px 0px 0px 20px;",
          "right: 20px;",
        ],
        arrowBorder: [
          "border-width: 22px 0px 0px 22px;",
          "right: 19px;",
        ],
      },
    },
    author: [
      "display: inline-block;",
      "font-size: 18px;",
      "line-height: 28px;",
    ],
    date: [
      "color: gray;",
      "float: right;",
    ],
    body: [
      "display: block;",
      "white-space: pre-wrap;",
    ],
    arrow: [
      "display: block;",
      "position: absolute;",
      "bottom: -18px;",
      "height: 20px;",
      "width: 20px;",
      "border-style: solid;",
      "box-sizing: border-box;",
      "border-color: white transparent transparent transparent;",
    ],
    arrowBorder: [
      "display: block;",
      "position: absolute;",
      "bottom: -22px;",
      "height: 22px;",
      "width: 22px;",
      "border-color: #BEBEBE transparent transparent transparent;",
      "border-style: solid;",
      "box-sizing: border-box;",
    ],
  },
});


}); // end define
