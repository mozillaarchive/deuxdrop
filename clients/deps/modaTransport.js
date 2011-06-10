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
      actions, socket;

  function send(obj) {
    socket.send(JSON.stringify(obj));
  }

  actions = {
    'signInComplete': function (data) {
      if (!transport.me) {
        transport.me = data.user;

        //TODO: Uncomment once testing is done.
        //localStorage.me = JSON.stringify(me);

        meDeferred.resolve(transport.me);
      }
    }
  };

  // Load user from storage
  transport.me = localStorage.me;
  if (transport.me) {
    transport.me = JSON.parse(transport.me);
  }

  // Right now socket.io in the browser does not use define() so grab
  // the global.
  io = window.io;

  socket = new io.Socket(null, {port: 8888, rememberTransport: false,
                transports: ['websocket', 'htmlfile', 'xhr-multipart', 'xhr-polling', 'jsonp-polling']
                });
  socket.connect();

  socket.on('message', function (data) {
    if (actions[data.action]) {
      actions[data.action](data);
    } else {
      console.log('Unhandled socket message: ' + JSON.stringify(data));
    }
  });

  socket.on('connect', function () {
    moda.trigger('networkConnected');
    if (transport.me) {
      transport.signIn(transport.me.id, transport.me.name);
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

});
