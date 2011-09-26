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
 * Ideally eternal tab that in a non-development UI would be user-friendly but
 *  for us is designed to be an egregious example of button-triggered tab
 *  opening right now.
 **/

define(
  [
    'wmsy/wmsy',
    './liveset-adapter',
    'text!./tab-home.css',
    'exports'
  ],
  function(
    $wmsy,
    $liveset,
    $_css,
    exports
  ) {

// define our tab type in the tabs domain
var ty = exports.ty =
  new $wmsy.WmsyDomain({id: "tab-home", domain: "tabs", css: $_css});

var wy = exports.wy =
  new $wmsy.WmsyDomain({id: "tab-home", domain: "moda", css: $_css});

ty.defineWidget({
  name: 'home-tab',
  constraint: {
    type: 'tab',
    obj: { kind: 'home' },
  },
  focus: wy.focus.container.horizontal('btnMakeFriends', 'btnFriendRequests',
                                       'btnListFriends'),
  emit: ['openTab'],
  structure: {
    helloMe: ["Welcome home, ", wy.bind(['userAccount', 'poco', 'displayName'])],

    buttonBar: {
      btnMakeFriends: wy.button("Ask people to be your friend!"),
      btnFriendRequests: wy.button("See who wants to be your friend!"),
      btnListFriends:
        wy.button("List existing friends and from there see conversations!"),
    },
  },
  impl: {
    postInit: function() {
      this.moda = this.__context.moda;
    },
  },
  events: {
    btnMakeFriends: {
      command: function() {
        this.emit_openTab({ kind: 'make-friends', name: "Make Friends!" }, true);
      },
    },
    btnFriendRequests: {
      command: function() {
        this.emit_openTab({ kind: 'requests', name: "Accept Friends!" }, true);
      },
    },
    btnListFriends: {
      command: function() {
        this.emit_openTab({ kind: 'peeps', name: "Peeps!" }, true);
      },
    },
  },
});

}); // end define
