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

/*jslint indent: 2, strict: false, plusplus: false */
/*global define: false */

/**
 * The data store layer.
 */

define(function (require) {
  var q = require('q'),
      listeners = {},
      listenerCounter = 0,
      peeps = [],

      moda, peepData, prop;

  /**
   * Trigger listeners on an object an any global listeners.
   */
  function trigger(obj, name, args) {
    var prop, cb;
    if (obj.on[name]) {
      obj.on[name].apply(obj, args);
    }

    for (prop in listeners) {
      if (listeners.hasOwnProperty(prop)) {
        cb = listeners[prop][name];
        if (cb) {
          cb.apply(listeners[prop], args);
        }
      }
    }
  }

/*
Peeps
* query: {
  by: 'recency|alphabet|pinned'
  filter: ''
}
* onPeepsComplete: function(), event
* onAddPeep: function(item), event
* addPeep: function(item)
* onremovePeep: function(item), event
* remove: function(item)
* peeps: Array, the array of items.
* onChangePeep: function(item) when a peep changes.
* byId: function(id) ?
* destroy()
*/
  function Peeps(query, on) {
    this.peeps = [];
    this.isComplete = false;
    this.query = query;
    this.on = on;

    var d = q.defer();
    q.when(d.promise, function (peeps) {
      this.peeps = peeps;
      trigger(this, 'peepsComplete', [peeps]);
    }.bind(this));

    //Ignore the query for now, use
    //dummy data.
    d.resolve(peeps);
  }

  Peeps.prototype = {
    /**
     * Adds a peep to the peeps.
     * @param {moda.peep} peep
     *
     */
    addPeep: function (peep) {
      if (this.peeps.indexOf(peep) === -1) {
        this.peeps.push(peep);
      }
      trigger('addPeep', this, arguments);
    },

    removePeep: function (peep) {
      this.peeps.splice(this.peeps.indexOf(peep), 1);
      trigger('removePeep', this, arguments);
    },

    destroy: function () {

    }
  };

/*

Peep
* id
* name
* pic
* onChange
* pinned
* pin()
* frecency
* conversations []
* onConvAdd  for conversation add
* onConvChange
* areConversationsLoaded
* loadConversations()
* onPeepChange
* destroy()
* remove()
* connect()
* reject()
* connected
* rejected
*/

  function Peep(obj) {
    this.id = obj.id;
    this.name = obj.name;
    this.pic = obj.pic;
    this.pinned = false;
    this.frecency = 0;

    this.areConversationsLoaded = false;

    //TODO: this should start as false
    this.connected = true;

    this.rejected = false;
  }

  Peep.prototype = {
    loadConversations: function () {

    }
  };

  /**
   * Define the moda object and API.
   */
  moda = {

/*
moda.on({
  message: ''
  peepChange
  peepsComplete
  peepConnectRequest
  networkProblem
  networkResolved
  badProgrammer
  peepConnectError

});
*/
    /**
     * Listen to events.
     *
     * @param {Object|String} listener if an object, the properties of the
     * object should be string names of events, and the values should be
     * the functions to call on that event. If a string, an event name
     * that should trigger the cb function
     *
     * @param {Function} [cb] If listener is a string, this is the function
     * callback to call for that event listener name.
     *
     * @returns {String} a listener ID. Use it to call removeOn to remove
     * this listener.
     */
    on: function (listener, cb) {
      var obj, listenerId;
      if (typeof listener === 'string') {
        obj = {};
        obj[listener] = cb;
      } else {
        obj = listener;
      }
      listenerId = 'listen' + (listenerCounter++);
      listeners[listenerId] = obj;
      return listenerId;
    },

    /**
     * Removes an event listener for the given listenerId
     *
     * @param {String} listenerId, the ID of the listener to remove.
     */
    removeOn: function (listenerId) {
      delete listeners[listenerId];
    },

    Peeps: Peeps,



    /**
     * Gets the data on the peep with the given ID.
     * @param {String} id the peep ID.
     */
    peep: function (id, cb, err) {
      var d = q.defer();

      d.resolve(peepData);

      return d.promise;
    }
  };

  /**
   * Fake data to use for UI mockups.
   */
  peepData = {
    'james@raindrop.it': new Peep({
      name: 'James',
      id: 'james@raindrop.it',
      pic: 'i/face2.png'
    }),
    'bryan@raindrop.it': new Peep({
      name: 'Bryan',
      id: 'bryan@raindrop.it',
      pic: 'i/face2.png'
    }),
    'andrew@raindrop.it': new Peep({
      name: 'Andrew',
      id: 'andrew@raindrop.it',
      pic: 'i/face2.png'
    })
  };

  /**
   * Fake peeps data.
   */
  peeps = [];
  for (prop in peepData) {
    if (peepData.hasOwnProperty(prop)) {
      peeps.push(peepData[prop]);
    }
  }

  return moda;
});

/*


Requests
* onComplete
* peeps


Conversation
* id
* seen {
  'peepId': 'messageId'
}
* received: {
  'peepId', 'messageId'
}
* onSeenUpdated
* onReceivedUpdated
* peeps: Array
* onPeepAdd()
* addPeep()
*
* messages: Array
* onMessage: function for when message is added.
* onMessagesLoaded: called when conversation is in a completed state.
* areMesssagesLoaded
* loadMessages()
* addMessage()
*
* pin()
* markSeen(msgId)
* destroy()
* remove()
*

Message
* id
* from
* text
* location
* time


var obj = moda.peeps({
  query: 'recency',
  onComplete: function () {
    this.items
  },
  onAdd: function () {

  },
  add: function() {

  }
})

}
*/


/*
Requests (email addr)
- by timer

Peeps
- by recency
- by alphabet/frecency (popularity)
- pinned

Peep Conversations
- time ordered
- pinned (per peep vs all peeps)

Conversations
- time-ordered

Messages
- body
- location

A conversation can have
- write: watermark/seen
- read: watermarks (seen) (received)

---------------

signup(email)

pin a conversation
pin a peep
update watermark for conversation
start new conversation:
  - peeps
  - message text
  - location
reply to conversation:
  - message text,
  - location
add someone(s) to conversation
  - peeps
delete a conversation
connect to a peep:
  - email
  - optional message
reject a peep
  - email
  - report(as)

-------------------

Peeps
+Compose
Pinned Peeps
Pinned Conversations

David
James

David
Hello....yesterday
hi.....today
[     ] send

conversation view
james invited roland
Show location in bubble
*/