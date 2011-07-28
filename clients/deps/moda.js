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
/*global define: false, console: false, window: false, document: false */

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
define(function (require, exports) {
  var q = require('q'),
      array = require('blade/array'),
      env = require('env'),
      listeners = {},
      listenerCounter = 0,
      moda = exports,
      convCache = {},
      userCache = {},
      chatPerms = {},
      requestIds = {},
      requestIdCounter = 0,
      targetOrigin = window && window.location ? window.location.protocol +
               '//' + window.location.host : '',

      me, request;

  /**
   * Matches responses from the serialized message transport to the
   * requests. If no request ID then it is a broadcast message from
   * the server.
   */
  function handleResponse(requestId, method, response) {
    if (requestId) {
      if (requestIds[requestId]) {
        requestIds[requestId](response);
        delete requestIds[requestId];
      }
    } else {
      // No request ID means it is a broadcast message.
      moda.trigger(method, response);
    }
  }

  if (env.name === 'browser') {
    // Make a request via the message transport suitable for web
    request = function (requestId, method, args) {
      var data = {
        kind: 'modaRequest',
        requestId: requestId,
        method: method,
        args: args
      };

      window.postMessage(JSON.stringify(data), targetOrigin);
    };

    // Listen to transport messages via postMessage
    window.addEventListener('message', function (evt) {
      // Pass data as JSON strings, so that it works in Firefox 5, later
      // firefoxen can use structured clone objects, but staying away
      // from that since it is still a bit new.
      if (evt.origin === targetOrigin && typeof evt.data === 'string' &&
          evt.data.indexOf('modaResponse') !== -1) {

        var data = JSON.parse(evt.data);

        handleResponse(data.requestId, data.method, data.response);
      }
    }, false);
  } else if (env.name === 'addon') {
    // Define the request function as using custom messages, due to this
    // jetpack bug: https://bugzilla.mozilla.org/show_bug.cgi?id=666547,
    // convert to a postMessage API once it is fixed.
    request = function (requestId, method, args) {
      var data = {
        kind: 'modaRequest',
        requestId: requestId,
        method: method,
        args: args
      }, event;

//console.log('moda.js moda-addon-message: ' + JSON.stringify(data));

      event = document.createEvent("MessageEvent");
      event.initMessageEvent('moda-addon-message', false, false, JSON.stringify(data), '*', null,
                             null, null);
      window.dispatchEvent(event);
    };

    window.addEventListener('moda-content-message', function (evt) {
//console.log('moda-content-message: ' + JSON.stringify(evt.data));
      var data = JSON.parse(evt.data);
      handleResponse(data.requestId, data.method, data.response);
    }, false);
  }

  /**
   * Sends a transport request through the correct channel, setting up
   * the callback-matching for the async transport response.
   * @param {String} method the name of the method to call on the transport
   * Arguments between the method and callback args are data args passed
   * to the transport method.
   * @param {Function} callback the very last argument to this function. If
   * the very last argument to this function is a function, then it is meant
   * to be a callback function, to be called with the transport response.
   */
  function transport() {
    var args = array.to(arguments),
        method = args.splice(0, 1)[0],
        requestId = '',
        callback;

    if (typeof args[args.length - 1] === 'function') {
      callback = args.splice(args.length - 1, 1)[0];
    }

    if (method) {
      requestId = 'id' + (requestIdCounter++);
      requestIds[requestId] = callback;
    }

    request(requestId, method, args);
  }

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

  function peepSort(a, b) {
    if (a.name > b.name) {
      return 1;
    } else if (a.name < b.name) {
      return -1;
    } else {
      return 0;
    }
  }

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

  function User(obj) {
    // If user is already in the cache, return that
    if (userCache[obj.id]) {
      return userCache[obj.id];
    }

    this.id = obj.id;
    this.name = obj.name;
    this.pic = obj.pic;
    this.pinned = false;
    this.frecency = 0;

    this.perms = {
      chat: chatPerms[obj.id]
    };

    // Add the peep to the peepCache
    if (!userCache[this.id]) {
      userCache[this.id] = this;
    }
    return this;
  }

  User.prototype = {
    /**
     * Gets the conversations for this user.
     * @param {Function} callback a callback to call when the conversations
     * are retrieved. The callback will receive an array of Conversation
     * objects.
     */
    getConversations: function (callback) {
      // Only ask the server if there are chat permissions on the user.
      if (this.perms.chat) {
        transport('getPeepConversations', this.id, callback);
      } else {
        var d = q.defer();
        q.when(d.promise, callback);
        d.resolve([]);
      }
    }
  };

  function Users(query, on) {
    this.items = [];
    this.isComplete = false;
    this.query = query;
    this.on = on;

    var d = q.defer();
    q.when(d.promise, function (users) {

      // Convert users into instance of peep objects
      users = users.map(function (user) {
        return new User(user);
      });

      this.items = users;
      trigger(this, 'usersComplete', [users]);
    }.bind(this));

    //Ignore the query for now, use
    //dummy data.
    transport('users', query, function (users) {
      d.resolve(users);
    });
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
    q.when(d.promise, function (users) {
      // Convert peeps into instance of peep objects
      users = users.map(function (user) {
        var peep = new User(user);
        peep.perms.peep = true;
        return peep;
      });

      this.items = users;
      trigger(this, 'peepsComplete', [users]);
    }.bind(this));

    //Ignore the query for now, use
    //dummy data.

    transport('peeps', query, function (users) {
      d.resolve(users);
    });
  }

  Peeps.prototype = {
    /**
     * Adds a peep to the peeps.
     * @param {String} peepId
     */
    addPeep: function (peepId, callback) {
      transport('addPeep', peepId, function (user) {
        var peep = new User(user);
        peep.perms.peep = true;

        this.items.push(peep);
        this.items.sort(peepSort);

        if (callback) {
          callback(user);
        }
        trigger(this, 'addPeep', arguments);
      }.bind(this));
    },

    removePeep: function (peep) {

    },

    destroy: function () {

    }
  };

  function Message(msg) {
    this.convId = msg.convId;
    this.id = msg.id;
    this.from = userCache[msg.from];
    this.text = msg.text;
    this.time = msg.time;
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

  function Conversation(id, on) {
    this.id = id;
    this.peeps = null;
    this.messages = null;
    this.on = {};
    this.messageDeferred = q.defer();

    convCache[id] = this;

    // Set up the retrieval of the messages and people.
    transport('loadConversation', id, function (details) {
      this.peeps = [];
      details.peepIds.forEach(function (peepId) {
        this.peeps.push(userCache[peepId]);
      }.bind(this));

      this.messages = details.messages.map(function (message) {
        return new Message(message);
      });

      // Make sure messages are in time order.
      this.messages.sort(function (a, b) {
        if (a.time > b.time) {
          return 1;
        } else if (a.time < b.time) {
          return -1;
        } else {
          return 0;
        }
      });

      this.messageDeferred.resolve(this);

      trigger(this, 'conversationComplete', [this]);
    }.bind(this));
  }

  Conversation.prototype = {
    withMessages: function (callback) {
      q.when(this.messageDeferred.promise, callback);
    },

    sendMessage: function (message) {
      transport('sendMessage', message);
    },

    setSeen: function () {
      var message = this.messages.length ? this.messages[this.messages.length - 1] : null;
      if (message) {
        transport('messageSeen', this.id, message.id);
      }
    }
  };


  /**
   * Define moda.
   */

/*
moda.on({
  message: ''
  peepChange
  peepsComplete
  peepConnectRequest
  networkConnected
  networkDisconnect
  networkReconnect
  networkReconnecting
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
  moda.on = function (listener, cb) {
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
  };

  /**
   * Removes an event listener for the given listenerId
   *
   * @param {String} listenerId, the ID of the listener to remove.
   */
  moda.removeOn = function (listenerId) {
    delete listeners[listenerId];
  };

  function notifyListeners(name, data) {
    // Cycle through listeners and notify them.
    var triggered = false,
        prop;

    for (prop in listeners) {
      if (listeners.hasOwnProperty(prop) && listeners[prop][name]) {
        listeners[prop][name](data);
        triggered = true;
      }
    }

    if (!triggered) {
      console.log('moda event [' + name + ']: ' + JSON.stringify(data));
    }
  }

  /**
   * Triggers an on event.
   */
  moda.trigger = function (name, data) {
    var conv, user;

    // Some messages require updates to cached objects
    if (name === 'message') {
      conv = convCache[data.convId];

      // The from field should be a reference to the peepCache.
      user = userCache[data.from];
      if (!user) {
        // Need to fetch the peep and bail out.
        transport('user', data.from, function (userData) {
          // temp is used to prevent jslint warning.
          var temp = new User(userData);

          //Re-trigger the event.
          moda.trigger(name, data);
        });

        // Bail on this trigger, wait for peep response to re-trigger.
        return;
      }

      data.from = user;
      if (conv && conv.messages) {
        conv.messages.push(data);
      }
    } else if (name === 'addedYou') {
      user = userCache[data.id];
      if (!user) {
        // Need to fetch the peep and bail out.
        transport('user', data.id, function (userData) {
          // temp is used to prevent jslint warning.
          var temp = new User(userData);

          //Re-trigger the event.
          moda.trigger(name, data);
        });

        // Bail on this trigger, wait for peep response to re-trigger.
        return;
      }
      data.user = user;
    } else if (name === 'signedIn') {
      me = new User(data);

      // Get list of people we can chat with. Needed before
      // being able to do useful things with people.
      transport('chatPerms', function (ids) {
        if (ids && ids.length) {
          ids.forEach(function (id) {
            chatPerms[id] = true;
          });
        }

        // Get all the peeps, since notifications need to
        // know if a person that added you is a peep.
        moda.peeps({}, {
          peepsComplete: function () {
            //Trigger the loading of unseen items.
            moda.listUnseen();

            notifyListeners(name, data);
          }
        });
      });

      // Return since notification of listeners will not happen
      // until after the data above is retrieved.
      return;

    } else if (name === 'chatPermsAdd') {
      chatPerms[data] = true;
      user = userCache[data];
      if (user) {
        user.perms.chat = true;
      }
    }

    notifyListeners(name, data);
  };

  moda.init = function () {
    transport('init', null);
  };

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
  moda.peeps = function (query, on) {
    return new Peeps(query, on);
  };

  moda.users = function (query, on) {
    return new Users(query, on);
  };

  moda.user = function (userId, callback) {
    var user = userCache[userId],
        d;
    if (user) {
      d = q.defer();
      q.when(d.promise, callback);
      d.resolve(user);
    } else {
      transport('user', userId, function (userData) {
        user = new User(userData);
        callback(user);
      });
    }
  };

  moda.markBulkSeen = function (ids) {
    transport('markBulkSeen', ids);
  };

  moda.conversation = function (query) {
    // only support by ID filtering
    var conv;

    if (query.by === 'id') {
      conv = convCache[query.filter];
      if (!conv) {
        conv = new Conversation(query.filter);
      }
    }

    return conv;
  };

  moda.startConversation = function (args) {
    transport('startConversation', args);
  };

  moda.signIn = function (assertion) {
    return transport('signIn', assertion);
  };

  moda.signOut = function (callback) {
    return transport('signOut', callback);
  };

  moda.listUnseen = function () {
    return transport('listUnseen', function (unseen) {
      // TODO: may want to optimize this display at some point
      // but passing it through the trigger machinery since it
      // has logic to make sure the peep object is loaded for
      // the message senders.
      var prop, data;

      for (prop in unseen) {
        if (unseen.hasOwnProperty(prop)) {
          data = unseen[prop];

          if (prop.indexOf('addedYou-') !== -1) {
            moda.trigger('addedYou', data);
          } else {
            // A message from a conversation.
            moda.trigger('message', data);
          }
        }
      }
    });
  };

  /**
   * Returns the user object for the signed in user. If not an object,
   * then it means the user is not signed in, and signIn should be called.
   */
  moda.me = function () {
    return me;
  };

/*
  //Fake data to use for UI mockups.
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

  // Fake peeps data.
  peeps = [];
  for (prop in peepData) {
    if (peepData.hasOwnProperty(prop) && prop !== 'me@raindrop.it') {
      peeps.push(peepData[prop]);
    }
  }

  //Fake conversations
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
  */

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