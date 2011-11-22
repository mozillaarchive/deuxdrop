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
 *
 **/

define(
  [
    'wmsy/wmsy',
    './liveset-adapter',
    'text!./tab-signup.css',
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
  new $wmsy.WmsyDomain({id: "tab-signup", domain: "tabs", css: $_css});

var wy = exports.wy =
  new $wmsy.WmsyDomain({id: "tab-signup", domain: "moda", css: $_css});

ty.defineWidget({
  name: 'signup-tab',
  constraint: {
    type: 'tab',
    obj: { kind: 'signup' },
  },
  focus: wy.focus.container.vertical('userPoco', 'servers', 'otherServer',
                                     'btnSignup'),
  emit: ['openTab', 'closeTab'],
  structure: {
    errBlock: {
      errMsg: "",
    },
    userInfoBlock: {
      userPoco: wy.widget({type: 'poco-edit'},
                          ['userAccount', 'poco']),
    },
    emailInfoBlock: {
      eiLabel: "browserid goes here.",
    },
    serverListBlock: {
      siLabel: "Pick a known server to use:",
      servers: wy.vertList({type: 'server'}),
      saLabel: "Or type in the domain name of a server (DANGER! MITM-able!):",
      otherServer: wy.text(),
    },
    buttonBar: {
      btnSignup: wy.button("Signup"),
    },
  },
  impl: {
    postInit: function() {
      var moda = this.__context.moda;

      var serverSet = moda.queryServers();
      var vs = new $liveset.LiveSetListenerViewSliceAdapter(serverSet);
      this.servers_set(vs);

      this.selectedServerBinding = null;

      this.otherServerQuery = null;
    },

    // notification the signup completed
    onCompleted: function(err) {
      var serverInfo = this.signupServerInfo;
      if (err !== null) {
        this.errMsg_element.textContent = "" + err;
        this.FOCUS.updateFocusRing();
      }
      else {
        var successTabObj = {
          kind: "signed-up",
          name: "Signed Up!",
          serverInfo: serverInfo,
        };
        this.emit_openTab(successTabObj, false, this.obj);
        var homeTabObj = {
          kind: "home",
          name: "Home",
          userAccount: this.obj.userAccount,
        };
        this.emit_openTab(homeTabObj, true, successTabObj);

        this.emit_closeTab(this.obj);
      }
    },

    destroy: function() {
      if (this.otherServerQuery)
        this.otherServerQuery.close();
    },
  },
  events: {
    servers: {
      command: function(serverBinding) {
        if (this.selectedServerBinding)
          this.selectedServerBinding.domNode.removeAttribute("selected");
        this.selectedServerBinding = serverBinding;
        this.selectedServerBinding.domNode.setAttribute("selected", "true");
      },
    },
    otherServer: {
      // use this to
      command: function() {
        if (this.selectedServerBinding)
          this.selectedServerBinding.domNode.removeAttribute("selected");
        this.selectedServerBinding = null;
      },
    },
    btnSignup: {
      command: function() {
        var self = this, moda = this.__context.moda;

        // er, should we be using emit/receive on this?  having it transparently
        //  update something out of our context?
        this.obj.userAccount.updatePersonalInfo(
          this.userPoco_element.binding.gimmePoco());

        if (this.selectedServerBinding) {
          var serverInfo = this.signupServerInfo =
            this.selectedServerBinding.obj;
          this.obj.userAccount.signupWithServer(serverInfo, this);
        }
        else {
          var serverDomain = this.otherServer_element.value;
          if (serverDomain) {
            if (this.otherServerQuery)
              this.otherServerQuery.close();
            this.otherServerQuery =
              moda.insecurelyQueryServerUsingDomainName(serverDomain, {
                onSplice: function() {},
                onCompleted: function() {
                  var serverInfo = self.otherServerQuery.items ?
                                     self.otherServerQuery.items[0] : null;
                  if (!serverInfo) {
                    // XXX l10n
                    self.errMsg_element.textContent =
                      "No server info available for: '" + serverDomain + "'";
                    return;
                  }
                  self.signupServerInfo = serverInfo;
                  self.obj.userAccount.signupWithServer(serverInfo, self);
                },
              });
          }
          else {
            // XXX l10n
            this.errMsg_element.textContent = "No server selected / entered!";
          }
        }
      },
    }
  },
});

wy.defineWidget({
  name: 'poco-editor',
  constraint: {
    type: 'poco-edit',
  },
  focus: wy.focus.container.vertical('displayName'),
  structure: {
    dnLabel: { // want a wy.label for this.
      ldn0: "I want to be known to the world as ",
      displayName: wy.text('displayName'),
      ldn1: "."
    },
  },
  impl: {
    gimmePoco: function() {
      return {
        displayName: this.displayName_element.value,
      };
    },
  },
});

wy.defineWidget({
  name: 'server-info',
  constraint: {
    type: 'server',
  },
  focus: wy.focus.item,
  structure: {
    urlBlock: [
      'Server URL: ', wy.bind('url'),
    ],
    dnBlock: [
      'Server Description: ', wy.bind('displayName'),
    ],
  },
});


ty.defineWidget({
  name: 'signed-up-tab',
  constraint: {
    type: 'tab',
    obj: { kind: 'signed-up' },
  },
  structure: {
    headerLabel: "Signed Up with Server!",
    descBlock: {
      longLabel: ['You signed up with: ',
                  wy.bind(['serverInfo', 'displayName'])],
    },
  },
});

}); // end define
