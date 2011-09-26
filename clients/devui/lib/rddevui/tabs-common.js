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
    'text!./tabs-common.css',
    'exports'
  ],
  function(
    $wmsy,
    $liveset,
    $_css,
    exports
  ) {

var LiveSetListenerViewSliceAdapter = $liveset.LiveSetListenerViewSliceAdapter;

// define our tab type in the tabs domain
var ty = exports.ty =
  new $wmsy.WmsyDomain({id: "tab-common", domain: "tabs", css: $_css});

var wy = exports.wy =
  new $wmsy.WmsyDomain({id: "tab-common", domain: "moda", css: $_css});

ty.defineWidget({
  name: 'peeps-tab',
  constraint: {
    type: 'tab',
    obj: { kind: 'peeps' },
  },
  focus: wy.focus.container.vertical('peeps'),
  emit: ['openTab'],
  structure: {
    peeps: wy.vertList({type: 'peep-blurb'}),
  },
  impl: {
    postInit: function() {
      var moda = this.__context.moda;

      var peepsSet = moda.queryPeeps();
      var vs = this.vs = new LiveSetListenerViewSliceAdapter(peepsSet);
      this.peeps_set(vs);
    },
    destroy: function(keepDom, forbidKeepDom) {
      this.vs.liveSet.close();
      this.__destroy(keepDom, forbidKeepDom);
    },
  },
  events: {
    peeps: {
      command: function(peepBinding) {
        this.emit_openTab({
          kind: 'conv-blurbs-tab',
          name: "Convs with " + peepBinding.obj.displayName,
          peep: peepBinding.obj,
        });
      },
    },
  },
});

wy.defineWidget({
  name: 'peep-blurb',
  constraint: {
    type: 'peep-blurb',
  },
  focus: wy.focus.item,
  structure: {
    name: "",
    unread: wy.bind('numUnreadAuthoredMessages'),
  },
  impl: {
    postInitUpdate: function() {
      var name;
      if (this.obj.ourPoco && this.obj.ourPoco.hasOwnProperty("displayName"))
        name = this.obj.ourPoco.displayName;
      else
        name = this.obj.selfPoco.displayName;
      this.name_element.textContent = name;
    },
  },
});

ty.defineWidget({
  name: 'requests-tab',
  constraint: {
    type: 'tab',
    obj: { kind: 'requests' },
  },
  focus: wy.focus.container.vertical('peeps'),
  structure: {
    peeps: wy.vertList({type: 'conn-request'}),
  },
  impl: {
    postInit: function() {
      var moda = this.__context.moda;

      var peepsSet = moda.queryConnectRequests();
      var vs = this.vs = new LiveSetListenerViewSliceAdapter(peepsSet);
      this.peeps_set(vs);
    },
    destroy: function(keepDom, forbidKeepDom) {
      this.vs.liveSet.close();
      this.__destroy(keepDom, forbidKeepDom);
    },
  }
});

wy.defineWidget({
  name: 'conn-request',
  constraint: {
    type: 'conn-request',
  },
  focus: wy.focus.item,
  structure: {
    peep: wy.widget({type: 'peep-blurb'}, 'peep'),
    messageText: wy.bind('messageText'),
  },
});

ty.defineWidget({
  name: 'conv-blurbs-tab',
  constraint: {
    type: 'tab',
    obj: { kind: 'conv-blurbs' },
  },
  focus: wy.focus.container.vertical('convBlurbs'),
  structure: {
    convBlurbs: wy.vertList({type: 'conv-blurb'}),
  },
  impl: {
    postInit: function() {
      var moda = this.__context.moda;

      var convBlurbsSet = moda.queryPeepsConversations(this.obj.peep, { by: 'any' });
      var vs = this.vs = new LiveSetListenerViewSliceAdapter(convBlurbsSet);
      this.convBlurbs_set(vs);
    },
    destroy: function(keepDom, forbidKeepDom) {
      this.vs.liveSet.close();
      this.__destroy(keepDom, forbidKeepDom);
    },
  }
});

wy.defineWidget({
  name: 'peep-inline',
  constraint: {
    type: 'peep-inline',
  },
  structure: {
    name: "",
  },
  impl: {
    postInitUpdate: function() {
      var name;
      if (this.obj.ourPoco && this.obj.ourPoco.hasOwnProperty("displayName"))
        name = this.obj.ourPoco.displayName;
      else
        name = this.obj.selfPoco.displayName;
      this.name_element.textContent = name;
    },
  },
});

wy.defineWidget({
  name: 'conv-blurb',
  constraint: {
    type: 'conv-blurb',
  },
  focus: wy.focus.item,
  structure: {
    participants: wy.widgetFlow({type: 'peep-inline'}, 'participants', {separator: ', '}),
    firstMessageText: wy.bind(['firstMessage', 'messageText']),
    numUnread: wy.bind('numUnreadMessages'),
  },
});

ty.defineWidget({
  name: 'conversation-tab',
  constraint: {
    type: 'tab',
    obj: { kind: 'conversation' },
  },
  focus: wy.focus.container.vertical('messages'),
  structure: {
    messages: wy.vertList({type: 'message'}),
  },
  impl: {
    postInit: function() {
      var moda = this.__context.moda;

      var msgsSet = moda.queryConversationMessages(this.obj.convBlurb);
      var vs = this.vs = new LiveSetListenerViewSliceAdapter(msgsSet);
      this.messages_set(vs);
    },
    destroy: function(keepDom, forbidKeepDom) {
      this.vs.liveSet.close();
      this.__destroy(keepDom, forbidKeepDom);
    },
  }
});

ty.defineWidget({
  name: 'make-friends-tab',
  constraint: {
    type: 'tab',
    obj: { kind: 'make-friends' },
  },
  focus: wy.focus.container.vertical('peeps'),
  emit: ['openTab'],
  structure: {
    peeps: wy.vertList({type: 'peep-blurb'}),
  },
  impl: {
    postInit: function() {
      var moda = this.__context.moda;

      var peepsSet = moda.queryAllKnownServersForPeeps();
      var vs = this.vs = new LiveSetListenerViewSliceAdapter(peepsSet);
      this.peeps_set(vs);
    },
    destroy: function(keepDom, forbidKeepDom) {
      this.vs.liveSet.close();
      this.__destroy(keepDom, forbidKeepDom);
    },
  },
  events: {
    peeps: {
      command: function(peepBinding) {
        var liveSet = this.vs.liveSet,
            peep = peepBinding.obj;
        // we need to keep the peep alive...
        liveSet.boostRefCount();
        this.emit_openTab({
          kind: 'author-contact-request',
          name: "Connect with " + peep.selfPoco.displayName,
          liveSet: liveSet,
          peep: peep,
          peepPoco: peep.selfPoco,
          message: '',
        }, true);
      },
    }
  }
});

ty.defineWidget({
  name: 'author-contact-request-tab',
  constraint: {
    type: 'tab',
    obj: { kind: 'author-contact-request' },
  },
  focus: wy.focus.container.vertical('pocoEditor', 'messageText', 'btnSend'),
  emit: ['closeTab'],
  structure: {
    peepBlock: {
      overviewLabel0: "We are going to ask: ",
      peep: wy.widget({ type: 'peep-blurb' }, 'peep'),
      overviewLabel1: " to be our friend.",
    },
    localPocoBlock: {
      pocoEditor: wy.widget({ type: 'oth-poco-edit' }, 'peepPoco'),
    },
    messageBlock: {
      messageLabel: "Message to send with your contact request: ",
      messageText: wy.text('message'),
    },
    buttonBlock: {
      btnSend: wy.button("Send contact request"),
    }
  },
  impl: {
    postInit: function() {
    },
    destroy: function(keepDom, forbidKeepDom) {
      this.obj.liveSet.close();
      this.__destroy(keepDom, forbidKeepDom);
    },
  },
  events: {
    btnSend: {
      command: function() {
        var moda = this.__context.moda;
        var ourPocoForPeep =
          this.pocoEditor_element.binding.gimmePoco();
        moda.connectToPeep(this.obj.peep, ourPocoForPeep,
                           this.messageText_element.value);

        this.emit_closeTab(this.obj);
      },
    }
  },
});

wy.defineWidget({
  name: 'other-person-poco-editor',
  doc: 'variant of poco-editor in tab-signup.js',
  constraint: {
    type: 'oth-poco-edit',
  },
  focus: wy.focus.container.vertical('displayName'),
  structure: {
    dnLabel: { // want a wy.label for this.
      ldn0: "I refer to this person amongst myself and others as: ",
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


ty.defineWidget({
  name: 'errors-tab',
  constraint: {
    type: 'tab',
    obj: { kind: 'errors' },
  },
  focus: wy.focus.container.vertical('errors'),
  emit: ['tabWantsAttention'],
  structure: {
    errors: wy.vertList({type: 'error-rep'}),
  },
  impl: {
    postInit: function() {
      var moda = this.__context.moda;

      var errorSet = moda.queryErrors(), self = this;
      var vs = this.vs = new LiveSetListenerViewSliceAdapter(errorSet, {
        newItemAdded: function() {
          self.emit_tabWantsAttention(self.obj);
        },
      });
      this.errors_set(vs);
    },
    destroy: function(keepDom, forbidKeepDom) {
      this.vs.liveSet.close();
      this.__destroy(keepDom, forbidKeepDom);
    },
  }
});

var l10nErrors = wy.defineLocalizedMap('errors', {
    serverDoesNotKnowWhoWeAre:
      "The server says we have no account.  Restart and sign-up again.",
  }, "Unknown error id: #0");

wy.defineWidget({
  name: 'error-rep',
  constraint: {
    type: 'error-rep',
  },
  focus: wy.focus.item,
  structure: {
    date: wy.bind('firstReported'),
    message: wy.bind('errorId', l10nErrors.lookup.bind(l10nErrors)),
  },
});


}); // end define
