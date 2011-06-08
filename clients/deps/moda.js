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

// from https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Function/bind
// bootstrap the JS env in some browsers that do not have full ES5
if (!Function.prototype.bind) {

  Function.prototype.bind = function (obj) {
    var slice = [].slice,
        args = slice.call(arguments, 1),
        self = this,
        Nop = function () {},
        bound = function () {
          return self.apply(this instanceof Nop ? this : (obj || {}),
                            args.concat(slice.call(arguments)));
        };

    Nop.prototype = self.prototype;

    bound.prototype = new Nop();

    return bound;
  };
}


/**
 * The data store layer.
 */
define(function (require) {
  var q = require('q'),
      listeners = {},
      listenerCounter = 0,
      messageIdCounter = 0,

      moda, prop,

      // fake data stuff
      peeps = [],
      peepData, convData, conv1, conv2, conversations;

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
    this.items = [];
    this.isComplete = false;
    this.query = query;
    this.on = on;

    var d = q.defer();
    q.when(d.promise, function (peeps) {
      this.items = peeps;
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
    /**
     * Gets the conversations for this user.
     * @param {Function} callback a callback to call when the conversations
     * are retrieved. The callback will receive an array of Conversation
     * objects.
     */
    getConversations: function (callback) {
      var d = q.defer();

      if (this.conversationsPromise) {
        q.when(this.conversationsPromise, callback);
      } else {
        // fake the data for now
        this.conversationsPromise = d.promise;
        q.when(this.conversationsPromise, callback);
        this.conversations = conversations[this.id];
        d.resolve(this.conversations);
      }
    }
  };

/*
Message
* id
* from
* text
* location
* time
*/

  function Message(from, text, time, location) {
    this.id = 'msg' + (messageIdCounter++);
    this.from = peepData[from];
    this.text = text;
    this.time = time || (new Date()).getTime();
    this.location = location;
  }

/*
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
*/

  function Conversation(id, peeps) {
    this.id = id;
    this.peeps = peeps;
    this.messages = [];
    this.on = {};
  }

  Conversation.prototype = {
    addMessage: function (message) {
      this.messages.push(message);
      trigger(this, 'message', arguments);
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

    /**
     * Grabs a list of Peeps based on a query value.
     *
     * @param {Object} query the query to used for data selection.
     * @param {Object} on an object whose properties are event names
     * and values are event handlers for events that can be triggered
     * for the return object.
     *
     * @returns {Peeps}
     */
    peeps: function (query, on) {
      return new Peeps(query, on);
    },

    /**
     * Grabs a list of Peeps based on a query value.
     *
     * @param {Object} query the query to used for data selection.
     * @param {Object} on an object whose properties are event names
     * and values are event handlers for events that can be triggered
     * for the return object.
     *
     * @returns {Peeps}
     */
    // TODO: on assignment does not work right now.
    conversation: function (query, on) {
      // only support by ID filtering
      var conv;

      if (query.by === 'id') {
        conv = convData[query.filter];
      }

      return conv;
    }
  };

  /**
   * Fake data to use for UI mockups.
   */
  peepData = {
    'me@raindrop.it': new Peep({
      name: 'Me',
      id: 'me@raindrop.it',
      pic: 'i/fake/me.png'
    }),
    'james@raindrop.it': new Peep({
      name: 'James',
      id: 'james@raindrop.it',
      pic: 'i/fake/james.jpg'
    }),
    'bryan@raindrop.it': new Peep({
      name: 'Bryan',
      id: 'bryan@raindrop.it',
      pic: 'i/fake/bryan.jpg'
    }),
    'andrew@raindrop.it': new Peep({
      name: 'Andrew',
      id: 'andrew@raindrop.it',
      pic: 'i/fake/andrew.jpg'
    })
  };

  /**
   * Fake peeps data.
   */
  peeps = [];
  for (prop in peepData) {
    if (peepData.hasOwnProperty(prop) && prop !== 'me@raindrop.it') {
      peeps.push(peepData[prop]);
    }
  }

  /**
   * Fake conversations
   */
  conv1 = new Conversation('conv1', [
    peepData['james@raindrop.it'], peepData['bryan@raindrop.it']
  ]);
  conv1.addMessage(new Message('me@raindrop.it', 'what\'s for lunch?'));
  conv1.addMessage(new Message('james@raindrop.it', 'fatburger'));
  conv1.addMessage(new Message('bryan@raindrop.it', 'what about acme?'));
  conv1.addMessage(new Message('me@raindrop.it', 'i like acme'));
  conv1.addMessage(new Message('james@raindrop.it', 'sounds good, let\'s do it!'));

  conv2 = new Conversation('conv2', [
    peepData['james@raindrop.it']
  ]);
  conv2.addMessage(new Message('james@raindrop.it', 'yt?'));
  conv2.addMessage(new Message('me@raindrop.it', 'yup'));
  conv2.addMessage(new Message('james@raindrop.it', 'What is that new game coming out?'));
  conv2.addMessage(new Message('me@raindrop.it', 'Mass Effect 3! I can\'t wait for it!'));
  conv2.addMessage(new Message('james@raindrop.it', 'Where are you going to get it?'));
  conv2.addMessage(new Message('me@raindrop.it', 'I will just order it online.'));
  conv2.addMessage(new Message('james@raindrop.it', 'OK. I\'ll wait for the reviews.'));

  convData = {
    conv1: conv1,
    conv2: conv2
  };

  conversations = {
    'james@raindrop.it': [
      conv1,
      conv2
    ],

    'bryan@raindrop.it' : [
      conv1
    ]
  };

  return moda;
});

/*


Requests
* onComplete
* peeps

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