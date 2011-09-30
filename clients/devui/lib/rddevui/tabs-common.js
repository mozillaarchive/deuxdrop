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
    'wmsy/viewslice-filter',
    './liveset-adapter',
    'text!./tabs-common.css',
    'exports'
  ],
  function(
    $wmsy,
    $vsf,
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

      var peepsSet = moda.queryPeeps({by: this.obj.sortBy});
      var vs = this.vs = new LiveSetListenerViewSliceAdapter(peepsSet);
      this.peeps_set(vs);
    },
  },
  events: {
    peeps: {
      command: function(peepBinding) {
        this.emit_openTab({
          kind: 'conv-blurbs',
          name: "Convs with " + peepBinding.obj.displayName,
          peep: peepBinding.obj,
          sortBy: 'any',
        }, true);
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
  focus: wy.focus.container.vertical('requests'),
  emit: ['openTab'],
  structure: {
    requests: wy.vertList({type: 'conn-request'}),
  },
  impl: {
    postInit: function() {
      var moda = this.__context.moda;

      var connReqsSet = moda.queryConnectRequests();
      var vs = this.vs = new LiveSetListenerViewSliceAdapter(connReqsSet);
      this.requests_set(vs);
    },
  },
  events: {
    requests: {
      command: function(connReqBinding) {
        var liveSet = this.vs.liveSet,
            connReq = connReqBinding.obj;
        // we need to keep the peep alive...
        liveSet.boostRefCount();
        this.emit_openTab({
          kind: 'accept-request',
          name: "Connect with " + connReq.peep.selfPoco.displayName,
          liveSet: liveSet,
          connReq: connReq,
        }, true);

      },
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
    peep: wy.bind(['peep', 'selfPoco', 'displayName']),
    server: wy.bind(['peepServer', 'url']),
    messageText: wy.bind('messageText'),
  },
});

ty.defineWidget({
  name: 'accept-request-tab',
  doc: 'Confirm accepting a connect request after seeing more details.',
  constraint: {
    type: 'tab',
    obj: { kind: 'accept-request' },
  },
  focus: wy.focus.container.vertical('btnAccept'),
  emit: ['closeTab'],
  structure: {
    overviewBlurb: [
      "Someone calling themselves ",
      wy.bind(['connReq', 'peep', 'selfPoco', 'displayName']),
      " wants to connect with you."
    ],
    serverBlurb: [
      "They are using server ",
      wy.bind(['connReq', 'peepServer', 'url']),
      " which claims to be '",
      wy.bind(['connReq', 'peepServer', 'displayName']),
      "'"
    ],

    messageBlurb: [
      "They included the following message with their request: '",
      wy.bind(['connReq', 'messageText']),
      "'.",
    ],

    localPocoBlock: {
      pocoEditor: wy.widget({ type: 'oth-poco-edit' },
                            ['connReq', 'peep', 'selfPoco']),
    },

    buttonBar: {
      btnAccept: wy.button("Accept connect request"),
    }
  },
  impl: {
  },
  events: {
    btnAccept: {
      command: function() {
        var ourPocoForPeep =
          this.pocoEditor_element.binding.gimmePoco();
        this.obj.connReq.acceptConnectRequest(ourPocoForPeep);
        this.emit_closeTab(this.obj);
      },
    }
  },
});

wy.defineWidget({
  name: 'peep-selector-popup',
  constraint: {
    type: 'peep-selector-popup',
  },
  focus: wy.focus.domain.vertical('peeps'),
  emit: ['resizePopup'],
  structure: {
    peeps: wy.vertList({ type: 'peep-blurb' }),
  },
  impl: {
    postInitUpdate: function() {
      var filterOut = this.obj.filterOut, moda = this.__context.moda,
          self = this;

      var vsRaw = this.vsRaw = new LiveSetListenerViewSliceAdapter(
        this.obj.peepsQuery, {
          initialCompletion: function() {
            // Because population was async, we now need to update the popup.
            // The alternative would be to have the peep selection widget provide
            //  a button.  The button would trigger the query, and only popup the
            //  popup when the query returns its results.

            self.emit_resizePopup();
            self.FOCUS.ensureDomainFocused(self.__focusDomain);
          }
        });
      var vsFilter = this.vs = new $vsf.DecoratingFilteringViewSlice(vsRaw, {
          filter: function(considerObj) {
            // only show things not in the filterOut list.
            return (filterOut.indexOf(considerObj) === -1);
          },
        }, 0.8);
      this.peeps_set(vsFilter);
    },
  },
  events: {
    peeps: {
      command: function(binding) {
        this.done(true, binding.obj);
      },
    },
  },
});

wy.defineWidget({
  name: 'conv-compose',
  constraint: {
    type: 'conv-compose',
  },
  popups: {
    addPeep: {
      constraint: {
        type: 'peep-selector-popup',
      },
      clickAway: true,
      popupWidget: wy.libWidget({ type: 'popup' }),
      position: {
        centerOn: "btnAddPeep",
      },
      size: {
        maxWidth: 0.5,
        maxHeight: 0.6,
      },
    },
  },
  focus: wy.focus.container.vertical('btnAddPeep', 'messageText'),
  structure: {
    peepBlock: {
      peepsLabel: "Peeps: ",
      peeps: wy.widgetFlow({type: 'peep-inline'}, 'peeps',
                           {separator: ', '}),
      btnAddPeep: wy.button("Add..."),
    },
    messageBlock: {
      messageText: wy.textarea('messageText'),
    },
  },
  events: {
    btnAddPeep: {
      command: function() {
        var self = this;
        // since we are handing off a reference to our query, boost its reference
        //  count.
        this.obj.peepsQuery.boostRefCount();
        this.popup_addPeep({
          sortBy: 'alphabet',
          filterOut: this.obj.peeps,
          peepsQuery: this.obj.peepsQuery,
        }, this, function(success, peepToAdd) {
          if (success)
            self.peeps_slice.mutateSplice(self.obj.peeps.length, 0,
                                          peepToAdd);
        });
      }
    },
  },
  impl: {
    postInit: function() {
      var moda = this.__context.moda;
      this.obj.peepsQuery = moda.queryPeeps({ by: 'any' });
    },
    gimmeConvArgs: function() {
      return {
        peeps: this.obj.peeps,
        text: this.messageText_element.value,
      };
    },
  },
});

ty.defineWidget({
  name: 'conv-compose-tab',
  constraint: {
    type: 'tab',
    obj: { kind: 'conv-compose' },
  },
  focus: wy.focus.container.vertical('composer', 'btnSend'),
  emit: ['closeTab'],
  structure: {
    composer: wy.widget({ type: 'conv-compose' }, 'convSeed'),
    btnSend: wy.button("Send!"),
  },
  events: {
    btnSend: {
      command: function() {
        var moda = this.__context.moda;
        moda.createConversation(this.composer_element.binding.gimmeConvArgs());
        this.emit_closeTab(this.obj);
      },
    }
  },
});

ty.defineWidget({
  name: 'conv-blurbs-tab',
  constraint: {
    type: 'tab',
    obj: { kind: 'conv-blurbs' },
  },
  focus: wy.focus.container.vertical('btnNewConv', 'convBlurbs'),
  emit: ['openTab'],
  structure: {
    btnNewConv: wy.button("Start a new conversation..."),
    convBlurbs: wy.vertList({type: 'conv-blurb'}),
  },
  impl: {
    postInit: function() {
      var moda = this.__context.moda;

      var convBlurbsSet = moda.queryPeepConversations(
                            this.obj.peep, { by: this.obj.sortBy });
      var vs = this.vs = new LiveSetListenerViewSliceAdapter(convBlurbsSet);
      this.convBlurbs_set(vs);
    },
  },
  events: {
    btnNewConv: {
      command: function() {
        this.emit_openTab({
          kind: 'conv-compose',
          name: 'Compose',
          convSeed: {
            peeps: [this.obj.peep],
            messageText: "",
          },
        }, true);
      }
    },
    convBlurbs: {
      command: function(convBlurbBinding) {
        var liveSet = this.vs.liveSet,
            convBlurb = convBlurbBinding.obj;
        liveSet.boostRefCount();
        this.emit_openTab({
          kind: 'conversation',
          name: "Conv: " + convBlurb.firstMessage.text.substring(0, 30),
          convBlurb: convBlurb,
        }, true);
      },
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
    mainBox: {
      participants: wy.widgetFlow({ type: 'peep-inline' }, 'participants',
                                  { separator: ', ' }),
      firstMessageText: wy.bind(['firstMessage', 'text']),
    },
    metaBox: {
      numUnread: wy.bind('numUnreadMessages'),
    }
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
    addMessageBlock: {
      newMessageText: wy.textarea(),
      btnSend: wy.button("Send message"),
    },
  },
  impl: {
    postInit: function() {
      var moda = this.__context.moda;

      var msgsSet = moda.queryConversationMessages(this.obj.convBlurb);
      var vs = this.vs = new LiveSetListenerViewSliceAdapter(msgsSet);
      this.messages_set(vs);
    },
  },
  events: {
    btnSend: {
      command: function() {
        var text = this.newMessageText_element.value;
        if (text) {
          this.obj.convBlurb.replyToConversation({
            text: text,
          });

          this.newMesageText_element.value = '';
        }
      },
    },
  }
});

wy.defineWidget({
  name: 'human-message',
  constraint: {
    type: 'message',
    obj: { type: 'message' },
  },
  structure: {
    date: wy.bind('receivedAt'),
    author: wy.widget({ type: 'peep-inline' }, 'author'),
    text: wy.bind('text'),
  },
});

wy.defineWidget({
  name: 'join-message',
  constraint: {
    type: 'message',
    obj: { type: 'join' },
  },
  structure: {
    date: wy.bind('receivedAt'),
    joiner: wy.widget({ type: 'peep-blurb' }, 'inviter'),
    label0: " invited ",
    joinee: wy.widget({ type: 'peep-blurb' }, 'invitee'),
    label1: " to join the conversation.",
  },
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
  }
});

var l10nErrors = wy.defineLocalizedMap('errors', {
    serverDoesNotKnowWhoWeAre:
      "The server says we have no account.  Restart and sign-up again.",
    discardedReplicaBlock:
      "The server told us something that made us sad, so we threw it away.",
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
