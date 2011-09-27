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
 * Development UI main func; binds the whole UI into existence.
 **/

define(
  [
    'wmsy/wmsy',
    'modality',
    './tabs',
    './tab-home',
    './tab-signup',
    './tabs-common',
    'text!./app.css',
    'exports'
  ],
  function(
    $wmsy,
    $modality,
    $_tabs,
    $_tab_home,
    $_tab_signup,
    $_tabs_common,
    $_css,
    exports
  ) {


var wy = exports.wy =
  new $wmsy.WmsyDomain({id: "app", domain: "tabs", css: $_css});


wy.defineWidget({
  name: "root",
  focus: wy.focus.domain.vertical("tl"),
  constraint: {
    type: "root",
  },
  provideContext: {
    moda: "moda",
  },
  structure: {
    tl: wy.widget({type: "top-level"}, wy.SELF),
  },
});


wy.defineWidget({
  name: "top-level",
  focus: wy.focus.container.horizontal("tabs"),
  constraint: {
    type: "top-level",
    obj: {state: "connected"},
  },
  emit: ["openTab"],
  structure: {
    globalBar: wy.widget({ type: 'global-bar' }, wy.SELF),
    tabs: wy.widget({type: "tabbox", orientation: "vertical"}, "tabState"),
  },
});

wy.defineWidget({
  name: 'global-bar',
  constraint: {
    type: 'global-bar',
  },
  structure: {
    widgets: wy.horizList({ type: 'global-bar-item' }, 'globalBarWidgets'),
  },
});

wy.defineWidget({
  name: 'gb-connected-status',
  constraint: {
    type: 'global-bar-item',
    obj: { kind: 'connected-status' },
  },
  structure: wy.block({
    // we could use css, but that's sketchy and not intended to be l10n-able
    label: wy.computed('getConnStatusLabelString'),
  }, { connection: ['moda', 'connectionStatus'] }),
  impl: {
    postInit: function() {
      this._bound_statusChange = this._needsbind_statusChange.bind(this);
      this.__context.moda.on('connectionStatusChange',
                             this._bound_statusChange);
    },
    destroy: function(keepDom, forbidKeepDom) {
      this.__context.moda.removeListener('connectionStatusChange',
                                         this._bound_statusChange);
      this.__destroy(keepDom, forbidKeepDom);
    },
    _needsbind_statusChange: function() {
      this.update();
    },
    getConnStatusLabelString: function(s) {
      // XXX just use the state directly for now...
      return this.obj.moda.connectionStatus;
    },
  },
});

wy.defineWidget({
  name: "about-tab",
  constraint: {
    type: "tab",
    obj: { kind: "about" },
  },
  structure: {
    blah: "This is a quality program here.  Ask anyone!",
  },
});

exports.main = function(doc) {
  var moda = $modality;
  var me = moda.whoAmI({
    onCompleted: function() {
      var rootObj = {
        moda: moda,
        userAccount: me,
        state: "connected",
        tabState: {
          index: 0,
          vertical: true,
          tabs: [
          ],
        },
        globalBarWidgets: [
          { kind: 'connected-status', moda: moda },
        ]
      };
      var tabs = rootObj.tabState.tabs;
      // create a 'signup' tab if not signed up already
      if (!me.havePersonalInfo || !me.haveServerAccount) {
        tabs.push({ kind: "signup", name: "Signup", userAccount: me });
      }
      else {
        tabs.push({ kind: "home", name: "Home", userAccount: me });
      }
      tabs.push({ kind: 'errors', name: "Errors" });
      // The about tab is too useless to show right now, and is no longer
      //  required to make us have multiple tabs.
      //tabs.push({ kind: "about", name: "About" });

      // bind the UI into existence.
      var binder = wy.wrapElement(doc.getElementById("body"));
      binder.bind({type: "root", obj: rootObj});
    }
  });
};

}); // end define
