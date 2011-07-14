
//Sample server taken from socket.io examples and hacked up.

/*jslint strict: false, nomen: false, indent: 2, plusplus: false */
/*global require: false, process: false, __dirname: false, console: false */

var http = require('http'),
    https = require('https'),
    url = require('url'),
    fs = require('fs'),
    path = require('path'),
    sys = require(process.binding('natives').util ? 'util' : 'sys'),
    io = require('socket.io'),
    redisLib = require('redis'),
    paperboy = require('paperboy'),
    md5 = require('md5'),
    clients = {},
    convCache = {},
    redis = redisLib.createClient(),
    defaultAudience = process.env.BROWSERID_AUDIENCE,
    server, actions, listener;

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

function sendSignInComplete(data, client, user) {
  var id = user && user.id,
      clientList;

  if (id) {
    clientList = clients[id] || (clients[id] = []);
    client._deuxUserId = id;

    clientList.push(client);
  }

  clientSend(client, data, {
    action: 'signInComplete',
    user: user
  });
}

function getPeep(peepId, data, client) {
  // Get the peep ID and return it.
  redis.multi().hgetall(peepId).exec(function (err, items) {
    clientSend(client, data, {
      action: 'addPeepResponse',
      peep: items[0]
    });
  });
}

actions = {

  'signIn': function (data, client) {
    var assertion = data.assertion,
        //The audience value should be hard-coded in the server config
        //should not rely on data from the client. However, it makes it
        //difficult to test in dev. Allow for optional config.
        audience = defaultAudience || data.audience,
        options, pic, req;

    // First check if we have saved data for the assertion.
    redis.get('browserid-assertion-' + assertion, function (err, value) {
      if (value && (value = value.toString())) {
        redis.hgetall(value, function (err, userData) {
          if (userData) {
            sendSignInComplete(data, client, userData);
          }
          // better not hit the else for this if.
        });
      } else {
        options = {
          host: 'browserid.org',
          port: '443',
          path: '/verify?assertion=' + encodeURIComponent(assertion) +
                '&audience=' + encodeURIComponent(audience)
        };

        req = https.get(options, function (response) {
          var responseData = '',
              id;

          response.on('data', function (chunk) {
            responseData += chunk;
          });

          response.on('end', function () {
            if (responseData) {
              responseData = JSON.parse(responseData);

              if (responseData.status === 'failure' ||
                  responseData.audience !== audience) {
                sendSignInComplete(data, client, null);
              } else {
                id = responseData.email;
                pic = 'http://www.gravatar.com/avatar/' +
                      md5.hex_md5(id.trim().toLowerCase());

                // Store the user data for next request.
                redis.set('browserid-assertion-' + assertion, id);

                //Add the user ID to the list of users.
                redis.sadd('users', id);

                //Add the user to the store
                redis.hmset(id, 'id', id, 'name', id, 'pic', pic);

                sendSignInComplete(data, client, {
                  id: id,
                  name: id,
                  pic: pic
                });
              }
            }
          });
        });
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

  'chatPerms': function (data, client) {
    var userId = client._deuxUserId;

    redis.smembers('chatPerms:' + userId, function (err, list) {
      var multi;

      if (list) {
        list = multiBulkToStringArray(list);
        list.sort(peepSort);

        clientSend(client, data, {
          action: 'chatPermsResponse',
          ids: list
        });
      } else {
        clientSend(client, data, {
          action: 'chatPermsResponse',
          ids: []
        });
      }
    });
  },

  'addPeep': function (data, client) {
    var peepId = data.peepId,
        userId = client._deuxUserId;

    // Add the list to the data store
    redis.sadd('peeps:' + userId, peepId);

    // If the peep has also added you, then set up a chat connection.
    redis.sismember('peeps:' + peepId, userId, function (err, isMember) {
      if (isMember) {
        // TODO: if one of these sadd()s fails, thing will get wonky.
        redis.sadd('chatPerms:' + userId, peepId);
        redis.sadd('chatPerms:' + peepId, userId);

        // Send data about the peep.
        getPeep(peepId, data, client);

        // Push the updated chatPerm to peep and user.
        pushToClients(userId, JSON.stringify({
          action: 'chatPermsAdd',
          id: peepId
        }));
        pushToClients(peepId, JSON.stringify({
          action: 'chatPermsAdd',
          id: userId
        }));
      } else {
        getPeep(peepId, data, client);
      }
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

server = http.createServer(function (req, res) {
  //Normal HTTP server stuff
  var ip = req.connection.remoteAddress;
  paperboy
    .deliver(path.join(__dirname, '.'), req, res)
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

server.listen(process.env.PORT || 8888);
console.log('Server is running on port ' + (process.env.PORT || 8888));

listener = io.listen(server, {
  transports: ['websocket', 'htmlfile', 'xhr-multipart', 'xhr-polling', 'jsonp-polling']
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
