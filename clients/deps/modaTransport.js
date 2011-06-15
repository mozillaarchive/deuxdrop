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

/*jslint indent: 2, strict: false */
/*global define: false, localStorage: false, window: false, console: false */
define(function (require, exports) {
  var moda = require('moda'),
      q = require('q'),
      io = require('socket.io'),
      transport = exports,
      meDeferred = q.defer(),
      deferreds = {},
      localMeCheck = false,
      actions, socket, me;

  function send(obj) {
    socket.send(JSON.stringify(obj));
  }

  /**
   * Factory machinery to creating an API that just calls back to the
   * server. Uses a deferred to only do the call once, so subsequent
   * calls just get the same response. Rely on event notifications
   * to catch data changes (moda layer should do this)
   * @param {String} action the name of the API
   * @param {String} [responseProp] optional name of the server's
   * response object property to use as the return data.
   */
  function makePassThroughApi(action, argNames, responseProp) {
    // add a response handler

    actions[action + 'Response'] = function (data) {
      deferreds[action].resolve(responseProp ? data[responseProp] : data);
    };

    // set up the public API method
    transport[action] = function () {
      var args = arguments,
          // The callback should be after the named args, so
          // grabbing the argNames.length should give us the callback location.
          callback = args[argNames.length],
          payload;

      if (!deferreds[action]) {
        deferreds[action] = q.defer();

        payload = {
          action: action
        };

        if (argNames) {
          argNames.forEach(function (name, i) {
            payload[name] = args[i];
          });
        }

        send(payload);
      }

      if (callback) {
        q.when(deferreds[action].promise, callback);
      }
    };
  }

  actions = {
    'signInComplete': function (data) {
      if (!me) {
        me = data.user;

        localStorage.me = JSON.stringify(me);

        meDeferred.resolve(me);

        moda.trigger('me', me);
      }
    },

    'message': function (data) {
      moda.trigger('message', data.message);
    }
  };

  // Right now socket.io in the browser does not use define() so grab
  // the global.
  io = window.io;

  socket = new io.Socket(null, {port: 8888, rememberTransport: false,
                transports: ['websocket', 'htmlfile', 'xhr-multipart', 'xhr-polling', 'jsonp-polling']
                });
  socket.connect();

  socket.on('message', function (data) {
    if (data) {
      data = JSON.parse(data);
    }

    if (actions[data.action]) {
      actions[data.action](data);
    } else {
      console.log('Unhandled socket message: ' + JSON.stringify(data));
    }
  });

  socket.on('connect', function () {
    moda.trigger('networkConnected');
    if (me) {
      transport.signIn(me.id, me.name);
    }
  });

  socket.on('disconnect', function () {
    moda.trigger('networkDisconnect');
  });

  socket.on('reconnect', function () {
    moda.trigger('networkReconnect');
  });

  socket.on('reconnecting', function (nextRetry) {
    moda.trigger('networkReconnecting', {
      nextRetry: nextRetry
    });
  });

  socket.on('reconnect_failed', function () {
    moda.trigger('networkDisconnect');
  });


  /**
   * Define the transport object
   */

  transport.me = function () {
    if (!me && !localMeCheck) {
      // Load user from storage
      me = localStorage.me;
      if (me) {
        me = JSON.parse(me);
        moda.trigger('me', me);
      }
      localMeCheck = true;
    }
    return me;
  };

  /**
   * Sign in the user.
   */
  transport.signIn = function (id, name, callback) {

    send({
      action: 'signIn',
      userId: id,
      userName: name
    });

    if (callback) {
      q.when(meDeferred.promise, callback);
    }
  };

  makePassThroughApi('peeps', ['query'], 'items');
  makePassThroughApi('users', ['query'], 'items');
  makePassThroughApi('addPeep', ['peepId'], 'peep');
  makePassThroughApi('loadConversation', ['convId'], 'details');

  makePassThroughApi('startConversation', ['args']);
  makePassThroughApi('sendMessage', ['message']);
});
