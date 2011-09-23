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

// define our tab type in the tabs domain
var ty = exports.ty =
  new $wmsy.WmsyDomain({id: "tab-common", domain: "tabs"});

var wy = exports.wy =
  new $wmsy.WmsyDomain({id: "tab-common", domain: "moda"});

ty.defineWidget({
  name: 'peeps-tab',
  constraint: {
    type: 'tab',
    obj: { kind: 'peeps' },
  },
  focus: wy.focus.container.vertical('peeps'),
  structure: {
    peeps: wy.vertList({type: 'peep-blurb'}),
  },
  impl: {
    postInit: function() {
      var moda = this.__context.moda;

      var peepsSet = moda.queryPeeps();
      var vs = new LiveSetListenerViewSliceAdapter(peepsSet);
      this.peeps_set(vs);
    },
  }
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

      var peepsSet = moda.queryPeeps();
      var vs = new LiveSetListenerViewSliceAdapter(peepsSet);
      this.peeps_set(vs);
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
      var vs = new LiveSetListenerViewSliceAdapter(convBlurbsSet);
      this.convBlurbs_set(vs);
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
      var vs = new LiveSetListenerViewSliceAdapter(msgsSet);
      this.messages_set(vs);
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
  structure: {
    peeps: wy.vertList({type: 'peep-blurb'}),
  },
  impl: {
    postInit: function() {
      var moda = this.__context.moda;

      var peepsSet = moda.queryAllKnownServersForPeeps();
      var vs = new LiveSetListenerViewSliceAdapter(peepsSet);
      this.peeps_set(vs);
    },
  }
});


}); // end define
