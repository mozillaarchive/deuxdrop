
define(function(require, exports) {

//Sample server taken from socket.io examples and hacked up.

/**
 * The double-fake server.  In a nutshell, it is a "server AND clients in a box"
 * configuration.  Specifically, we run the 'smart' client here in the server
 * and use the existing UI fake-server protocol that backs the UI speculative
 * moda implementation to expose that to the user.
 *
 * This operational mode does not correspond to any planned early deliverables.
 * While we do want to support an operational mode where the user can log-in
 * using just a web browser, this is not how we want to accomplish it.
 *
 * Changes from single-fake server, in short:
 * - All our storage in this file uses our gendb abstraction talking to redis
 *    on redis database #3 (select(3)) which we are requiring no one else to
 *    touch.  We namespace our use in this file with "FAKE", we namespace the
 *    server with "SERVER", and clients with "CLIENT:<NAME>".
 *
 * - On startup we spin-up a fullpub configuration server.  Its identity is
 *    persisted to/from our redis store.
 *
 * - On sign-in we create a rawclient instance using a per-user blob that we
 *    store in redis.  (In reality, this would come from the device's local
 *    storage somehow.)  Each rawclient is provided with a namespaced redis
 *    db connection.
 *
 * - All existing operations that used direct redis operations are now
 *    implemented in terms of rawclient.
 **/

/*jslint strict: false, nomen: false, indent: 2, plusplus: false */
/*global require: false, process: false, __dirname: false, console: false */

var http = require('http'),
    url = require('url'),
    fs = require('fs'),
    path = require('path'),
    sys = require(process.binding('natives').util ? 'util' : 'sys'),
    io = require('socket.io'),
    paperboy = require('paperboy'),
    md5 = require('md5'),
    $Q = require('q');

var $gendb = require('rdservers/gendb/redis'),
    $configurer = require('rdservers/configurer');

var clients = {},
    convCache = {},
    server, actions, listener,
    dbFake, dbServer;

function send(id, message) {
  var clientList = clients[id];
  clientList.forEach(function (client) {
    client.emit('clientMessage', message);
  });
}

function multiBulkToStringArray(data) {
  return data.map(function (item) {
    return item.toString();
  });
}

function multiBulkToJsonArray(data) {
  return data.map(function (item) {
    return JSON.parse(item.toString());
  });
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

function pushToClients(targetId, message) {
  var list = clients[targetId];
  if (list) {
    list.forEach(function (client) {
      client.emit('clientMessage', message);
    });
  }
}

/**
 * Handles sending a responseData object to the client. Does
 * the JSON stringify work, and also transfers over the defer ID
 * so the client can match the response with the request.
 */
function clientSend(client, requestData, responseData) {

  if (requestData._deferId) {
    responseData._deferId = requestData._deferId;
  }

  console.log("CLIENT SEND: " + JSON.stringify(responseData));

  client.emit('clientMessage', JSON.stringify(responseData));
}

redis.on('error', function (err) {
  console.log('Redis error: ' + err);
});

actions = {

  'signIn': function (data, client) {
    var id = data.userId,
        name = data.userName,
        clientList = clients[id] || (clients[id] = []),
        pic = 'http://www.gravatar.com/avatar/' +
              md5.hex_md5(id.trim().toLowerCase());

    client._deuxUserId = id;

    function fallbackMakeClient() {
      var poco = {
        displayName: name,
      };
      var rawClient = $rawclient.makeClientForNewIdentity(poco, db, null);
      client._rawClient = rawClient;
    };
    var db = makeDbConn('CLIENT:' + id);
    $Q.when($rawclient.getClientForExistingIdentityFromStorage(db, null),
      function(rawClient) {
        if (rawClient)
          client._rawClient = rawClient;
        else
          fallbackMakeClient();
      },
      fallbackMakeClient
    );

    //Add the user ID to the list of users.
    redis.sadd('users', id);

    //Add the user to the store
    redis.hmset(id, 'id', id, 'name', name, 'pic', pic);

    clientList.push(client);

    clientSend(client, data, {
      action: 'signInComplete',
      user: {
        id: id,
        name: name,
        pic: pic
      }
    });
  },

  'disconnect': function (data, client) {
    var id = client._deuxUserId,
        clientList = clients[id],
        index;

    if (!id) {
      //This client did not have a user ID associated with it, drop it.
      return;
    }

    index = clientList.indexOf(client);
    if (index === -1) {
      console.log('HUH? Disconnect called, but cannot find client.');
    } else {
      clientList.splice(index, 1);
    }
  },

  'users': function (data, client) {
    //Pull a list of users from redis.
    redis.smembers('users', function (err, list) {
      var multi;
      if (list) {
        list = multiBulkToStringArray(list);
        list.sort(peepSort);

        //Fetch individual user records.
        multi = redis.multi();
        list.forEach(function (id) {
          multi.hgetall(id);
        });
        multi.exec(function (err, hashes) {
          clientSend(client, data, {
            action: 'usersResponse',
            items: hashes
          });
        });
      } else {
        clientSend(client, data, {
          action: 'usersResponse',
          items: []
        });
      }
    });
  },

  'peeps': function (data, client) {
    var userId = client._deuxUserId;

    redis.smembers('peeps:' + userId, function (err, list) {
      var multi;

      if (list) {
        list = multiBulkToStringArray(list);
        list.sort(peepSort);

        //Fetch individual user records.
        multi = redis.multi();
        list.forEach(function (id) {
          multi.hgetall(id);
        });
        multi.exec(function (err, hashes) {
          clientSend(client, data, {
            action: 'peepsResponse',
            items: hashes
          });
        });
      } else {
        clientSend(client, data, {
          action: 'peepsResponse',
          items: []
        });
      }
    });
  },

  'peep': function (data, client) {
    var peepId = data.peepId,
        multi;

    // Get the peep ID and return it.
    multi = redis
              .multi()
              .hgetall(peepId)
              .exec(function (err, items) {
                clientSend(client, data, {
                  action: 'peepResponse',
                  peep: items[0],
                  _deferId: data._deferId
                });
              });
  },

  'addPeep': function (data, client) {
    var peepId = data.peepId,
        userId = client._deuxUserId,
        multi;

    // Add the list to the data store
    redis.sadd('peeps:' + userId, peepId);

    // Get the peep ID and return it.
    multi = redis
              .multi()
              .hgetall(peepId)
              .exec(function (err, items) {
                clientSend(client, data, {
                  action: 'addPeepResponse',
                  peep: items[0]
                });
              });
  },

  'removePeep': function (data, client) {
    var peepId = data.peepId,
        userId = client._deuxUserId;

    redis.srem('peeps:' + userId, peepId);
  },

  'getPeepConversations': function (data, client) {
    var peepId = data.peepId,
        userId = client._deuxUserId,
        multi;

    redis.smembers(userId + '-' + peepId, function (err, convIds) {
      convIds = multiBulkToStringArray(convIds || []);

      // Now get the conversation objects for each convId
      multi = redis.multi();

      convIds.forEach(function (convId) {
        multi.hgetall(convId + '-' + peepId);
      });

      multi.exec(function (err, summaries) {
        // Rehydrate the message
        var results = [],
            i, summary;

        // There may not be a most current message from the user
        // for a given conversation, in which case the summary object
        // will be an empty object. Weed those out.
        for (i = 0; (summary = summaries[i]); i++) {
          if (typeof summary.message === 'string') {
            summary.message = JSON.parse(summary.message);
            results.push(summary);
          }
        }

        // Send the response
        clientSend(client, data, {
          action: 'getPeepConversationsResponse',
          conversations: results
        });
      });
    });
  },

  'loadConversation': function (data, client) {
    var convId = data.convId;

    // Get the people involved
    redis.smembers(convId + '-peeps', function (err, peeps) {
      peeps = multiBulkToStringArray(peeps);

      // Now get messages in the conversation.
      redis.smembers(convId + '-messages', function (err, messages) {
        messages = multiBulkToJsonArray(messages);

        clientSend(client, data, {
          action: 'loadConversationResponse',
          details: {
            peepIds: peeps,
            messages: messages
          }
        });
      });
    });
  },

  'startConversation': function (data, client) {
    var args = data.args,
        from = args.from,
        to = args.to.split(','),
        users = [from].concat(to),
        text = args.text,
        time = (new Date()).getTime(),
        convId = args.from + '|' + args.to + '|' + time,
        message, responseMessage, stringifiedMessage;

    message = {
      id: 0,
      convId: convId,
      from: from,
      text: text,
      time: time
    };

    // Create the meta data record
    //redis.hmset(convId + '-meta', 'id', convId);

    // Set up the message counter.
    redis.set(convId + '-messageCounter', '0', function (err, response) {

      stringifiedMessage = JSON.stringify(message);

      responseMessage = JSON.stringify({
        action: 'message',
        message: message
      });

      // Add the message to the message list for the conversation.
      redis.sadd(convId + '-messages', stringifiedMessage);

      // Update the "last message from user" conversation summary for use
      // when showing the list of conversations from a user.
      redis.hmset(convId + '-' + from, 'message', stringifiedMessage);

      users.forEach(function (user) {
        // Add the user to the peep list for the conversation.
        redis.sadd(convId + '-peeps', user);

        // Update the set of conversations a user is involved in,
        // but scope it per user
        users.forEach(function (other) {
          redis.sadd(user + '-' + other, convId);
        });

        // Update the unseen set for the user, as long as the user
        // is not the "from" person.
        if (user !== from) {
          redis.hexists(user + '-unseen', convId, function (err, exists) {
            if (!exists) {
              redis.hset(user + '-unseen', convId, stringifiedMessage);
            }
          });
        }

        // Push the message to any user clients
        pushToClients(user, responseMessage);
      });
    });
  },

  'sendMessage': function (data, client) {
    var messageData = data.message,
        convId = messageData.convId,
        message, responseMessage, stringifiedMessage;

    message = {
      convId: convId,
      from: messageData.from,
      text: messageData.text,
      time: (new Date()).getTime()
    };

    // Increment the message ID counter by one so we can get unique message
    // IDs.
    redis.incr(convId + '-messageCounter', function (err, id) {

      message.id = id;

      stringifiedMessage = JSON.stringify(message);

      responseMessage = JSON.stringify({
        action: 'message',
        message: message
      });

      // Add the message to the message list for the conversation.
      redis.sadd(convId + '-messages', stringifiedMessage);

      // Update the "last message from user" conversation summary for use
      // when showing the list of conversations from a user.
      redis.hmset(convId + '-' + message.from, 'message', stringifiedMessage);

      // Get all conversation participants to send the message.
      redis.smembers(convId + '-peeps', function (err, users) {
        users = multiBulkToStringArray(users);
        users.forEach(function (user) {
          // Update the unseen set for the user, as long as the user
          // is not the "from" person.
          if (user !== message.from) {
            redis.hexists(user + '-unseen', convId, function (err, exists) {
              if (!exists) {
                redis.hset(user + '-unseen', convId, stringifiedMessage);
              }
            });
          }

          // Push the message to any user clients
          pushToClients(user, responseMessage);
        });
      });
    });
  },

  'messageSeen': function (data, client) {
    var convId = data.convId,
        messageId = data.messageId,
        userId = client._deuxUserId;

    // Update unseen hash for the user
    redis.hget(userId + '-unseen', convId, function (err, json) {
      var message = JSON.parse(json);

      if (message && messageId >= message.id) {
        redis.hdel(userId + '-unseen', convId);
      }
    });

    // Update the 'seen' metadata for the conversation.
    redis.hset(convId + 'seen', userId, messageId);
  },

  'listUnseen': function (data, client) {
    var userId = client._deuxUserId;

    redis.hgetall(userId + '-unseen', function (err, unseen) {
      // Convert messages to be JS objects
      unseen = unseen || {};

      var prop, message;

      for (prop in unseen) {
        if (unseen.hasOwnProperty(prop)) {
          message = unseen[prop];
          if (message) {
            unseen[prop] = JSON.parse(message);
          }
        }
      }

      clientSend(client, data, {
        action: 'listUnseenResponse',
        unseen: unseen
      });
    });
  }

};

function makeDbConn(prefix) {
  var db = new $gendb.RedisDbConn({host: '127.0.0.1', port: 6379}, prefix);
  db._conn.select(3);
  return db;
}

const FAKE_IN_ONE_SERVER_URL = 'localhost:7999';
exports.goForthAndBeFake = function(webPort) {
  dbFake = makeDbConn('FAKE');
  dbServer = makeDbConn('SERVER');

  // note: this asynchronously creates
  $configurer.loadOrCreateAndPersistServerJustMakeItGo(
    dbServer, FAKE_IN_ONE_SERVER_URL);

  server = http.createServer(function (req, res) {
    //Normal HTTP server stuff
    var ip = req.connection.remoteAddress;
    paperboy
      .deliver(path.join(__dirname, '../../clients'), req, res)
      .addHeader('Expires', 300)
      .error(function (statCode, msg) {
        res.writeHead(statCode, {'Content-Type': 'text/plain'});
        res.end("Error " + statCode);
        console.log(statCode, req.url, ip, msg);
      })
      .otherwise(function (err) {
        res.writeHead(404, {'Content-Type': 'text/plain'});
        res.end("Error 404: File not found");
        console.log(404, req.url, ip, err);
      });
  });

  server.listen(webPort);

  listener = io.listen(server, {
    transports: ['websocket', 'htmlfile', 'xhr-multipart',
                 'xhr-polling', 'jsonp-polling']
  });

  listener.sockets.on('connection', function (client) {
    //client.send({ buffer: buffer });
    //client.broadcast({ announcement: client.sessionId + ' connected' });

    client.on('serverMessage', function (message) {
      message = JSON.parse(message);

      actions[message.action](message, client);
      //client.broadcast(msg);
    });

    client.on('disconnect', function () {
      actions.disconnect({}, client);
    });
  });
};

}); // end define
