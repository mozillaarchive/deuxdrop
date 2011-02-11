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

var wy = exports.wy = new $wmsy.WmsyDomain({id: "ui-pager",
                                            domain: "deuxnius",
                                            clickToFocus: true});

/**
 * UI fully configured steady-state that uses a page idiom; intended to support
 *  a mobile idiom but perhaps mappable to a tabbed-style interface too?
 *
 * Potential transition idioms:
 * - Hierarchical descent (ex: contact => conversation)
 * - Modal dialog style (ex: define a new tag)
 * - Popup style (ex: select a tag from a big list)
 */
wy.defineWidget({
  name: "app-state-pager",
  constraint: {
    type: "app-state",
    obj: { state: "pager" },
  },
  provideContext: {
    store: "store",
  },
  structure: {
    headerBar: {
      backButton: wy.button("back"),
      header: "",
    },
    page: wy.widget({type: "page"}),
  },
  impl: {
    postInit: function() {
      this.pageStack = [];
      this.curPage = null;
      this.curMeta = null;
    },
    pageOp: function(action, pageDef) {
      if (this.curMeta)
        this.curMeta.scroll = this.domNode.scrollTop;

      switch (action) {
        case "push":
          this.curMeta = {scroll: 0};
          this.pageStack.push([pageDef, this.curMeta]);
          this.curPage = pageDef;
          break;
        case "pop":
          if (this.pageStack.length > 1)
            this.pageStack.pop();
          var curTupe = this.pageStack[this.pageStack.length - 1];
          this.curPage = curTupe[0];
          this.curMeta = curTupe[1];
          break;
      };

      this.header_element.textContent = this.curPage.heading;
      this.page_set(this.curPage);
      this.domNode.scrollTop = this.curMeta.scroll;
    },
  },
  receive: {
    gotoPage: function(action, pageDef) {
      this.pageOp(action, pageDef);
    },
  },
  events: {
    backButton: {
      command: function() {
        this.pageOp("pop", null);
      },
    },
  },
  style: {
    root: [
      "width: 800px;",
      "height: 480px;",
      "overflow: auto;",
      "border: 1px solid black;",
    ],
    headerBar: [
      "background: blue -webkit-gradient(linear,left top,left bottom,from(rgba(255, 255, 255, 0.6)),color-stop(0.5,rgba(255, 255, 255, 0.15)),color-stop(0.5,rgba(255, 255, 255, 0.01)),to(transparent));",
    ],
    header: [
      "font-size: 150%;",
      "color: white;",
    ],
    "backButton": [
      "vertical-align: top;",
    ],
  },
});



}); // end define
