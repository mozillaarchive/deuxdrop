/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Provides the ability for the mobileui interfaces to be run as a "dumb" web
 *  client mode where we run the "clientdaemon" logic here on the server and
 *  the web browser just runs the UI logic.  We then use a WebSocket connection
 *  to serve as the moda bridge conduit between the UI and the client daemon.
 *
 * The file mapping looks like so:
 * - dumbweb/
 *   - mobileui/: fallback mapped to clients/mobileui/
 *     - js/main.js: override mapped to clients/dumbweb/frontrun-main.js which
 *         establishes the WebSocket connection with us,
 *   - deps/:  fallback mapped to clients/deps/
 *     - rdcommon/: fallback mapped to common/lib/rdcommon/
 *     - modality.js: override mapped to clients/dumbweb/modality.js
 **/

define(function(require, exports, $module) {

var $path = require('path'),
    $crypto = require('crypto'),
    $Q = require('q'),

    $log = require('rdcommon/log'),
    $task = require('rdcommon/taskidiom'),

    $rawclient = require('rdcommon/rawclient/api'),
    $backside = require('rdcommon/moda/backside'),

    $connect = require('connect'),
    $static = $connect['static'],
    $persona = require('browserid-verifier');

var LOGFAB = exports.LOGFAB = $log.register($module, {
  dumbConnTracker: {
    type: $log.DAEMON,
    subtype: $log.SERVER,
    topBilling: false,
    events: {
      newConnection: {},
      deadConnection: {},
    },
    errors: {
    },
  },

  dumbClientAccount: {
    type: $log.DAEMON,
    subtype: $log.SERVER,
    topBilling: false,
    semanticIdent: {
      userIdent: 'key:root:user',
    },
  },

  dumbConn: {
    type: $log.CONNECTION,
    subtype: $log.CLIENT,
    topBilling: false,
    semanticIdent: {
      port: 'port',
      email: 'client',
    },
    events: {
      verified: { email: true },
    },
    asyncJobs: {
      verifyAssertion: {},
    },
    errors: {
      badPersonaAssertion: { err: false },
    },
  },
});

var taskMaster = $task.makeTaskMasterForModule($module, LOGFAB);

const TBL_USER_ACCOUNTS = 'dumbweb:userAccounts';

const ZOMBIE_DURATION_MS = 10 * 60 * 1000,
      SESSION_COOKIE_BYTES = 24;

/**
 * Create a random sequence that it would be hard for people to guess for use
 *  as a session cookie.
 */
function makeSessionCookie() {
  return $crypto.randomBytes(SESSION_COOKIE_BYTES).toString('base64');
}

function ClientContext(tracker, email) {
  this._log = LOGFAB.dumbClientAccount(this, tracker._log, [null]);
  this._tracker = tracker;
  this.email = email;
  this.userDb = null;

  this.conns = [];

  var gocTask = new GetOrCreateDumbAccountTask(
                  { acctDb: tracker._db, context: this }, tracker._log);
  this.clientPromise = gocTask.run();
  var self = this;
  $Q.when(this.clientPromise, function(client) {
      client.connect();
      self.clientPromise = client;
      self._log.__updateIdent([client.rootPublicKey]);

      client.registerForAccountChangeNotifications(self);
      return client;
    });
}
ClientContext.prototype = {
  accountChanged: function(client) {
    this.userDb.putCells(TBL_USER_ACCOUNTS, this.email,
      { 'd:clientblob': client.__persist() });
  },

  handleDeadConn: function(bconn) {
    var idx = this.conns.indexOf(bconn);
    this.conns.splice(idx, 1);

    if (this.conns.length === 0) {
      this._die();
      return true;
    }
    return false;
  },

  migrateConn: function(oldConn, newConn) {
    var idx = this.conns.indexOf(oldConn);
    this.conns.splice(idx, 1, newConn);
  },

  _die: function() {
    var self = this;
    when(this.clientPromise, function(client) {
      client.disconnect();
    });
  },
};

var GetOrCreateDumbAccountTask = taskMaster.defineEarlyReturnTask({
  name: 'getOrCreateDumbAccount',
  args: ['acctDb', 'context'],
  steps: {
    lookup_account: function() {
      return this.acctDb.getRowCell(TBL_USER_ACCOUNTS,
                                    this.context.email, 'd:clientblob');
    },
    maybe_got_account: function(cell) {
      this.context.userDb = this.acctDb.createSubConnection(
        'u_' + this.context.email, this.context._log);
      if (cell) {
        return this.earlyReturn(
          $rawclient.getClientForExistingIdentityFromStorage(
            cell, this.context.userDb, this.context._log));
      }
      return null;
    },
    /**
     * The account does not exist yet; create a new identity and sign-up with
     *  ourselves.
     */
    signup_with_self: function() {
      this.client = $rawclient.makeClientForNewIdentity({
          displayName: this.context.email,
          emails: [this.context.email],
        },
        this.context.userDb, this.context._log);
      // a signup failure (which should not happen), will get rejected and
      //  trigger the failure of this task.
      return this.client.signupUsingServerSelfIdent(
        this.context._tracker.serverConfig.selfIdentBlob);
    },
    signup_success_persist: function() {
      return this.context.userDb.putCells(TBL_USER_ACCOUNTS, this.context.email,
        { 'd:clientblob': this.client.__persist() });
    },
    persisted: function() {
      return this.client;
    }
  },
});

/**
 * Track existing connections and recently deceased connections for the purposes
 *  of being able to reestablish websocket connections that were in limbo due
 *  to short-lived/transient disconnections.  For example, if a user closes
 *  their laptop for a few seconds to move to another room or changes their
 *  network connection, we want a clean changeover with no loss of state on
 *  the client.
 */
function ConnectionTracker(serverConfig) {
  this._log = LOGFAB.dumbConnTracker(this, serverConfig.rootLogger,
                                     serverConfig.host);
  this.serverConfig = serverConfig;
  this._db = serverConfig.db;

  /**
   * Maps e-mail addresses
   */
  this._emailToClientContext = {};

  /**
   * Map session cookies to live connections.
   */
  this._sessionCookieToLiveConnection = {};
  /**
   * Map session cookies to dead connections that are awaiting reaping.
   */
  this._sessionCookieToDeadConnection = {};

  this._liveConnections = [];
}
ConnectionTracker.prototype = {
  makeConnection: function(rawConn) {
    this._log.newConnection();
    var bconn = new BridgeConn(this, rawConn);
    this._liveConnections.push(bconn);
  },

  reportZombieConn: function(bconn) {
    this._liveConnections.splice(this._liveConnections.indexOf(bconn), 1);

    delete this._sessionCookieToLiveConnection[bconn.sessionCookie];
    this._sessionCookieToDeadConnection[bconn.sessionCookie] = bconn;
  },

  reportDeadConn: function(bconn, wasZombie, contextDied) {
    if (!wasZombie) {
      this._liveConnections.splice(this._liveConnections.indexOf(bconn), 1);
    }
    else {
      delete self._sessionCookieToDeadConnection[bconn.sessionCookie];
    }
    if (contextDied) {
      delete this._emailToClientContext[bconn.context.email];
    }
    this._log.deadConnection();
  },

  hookupVerifiedConnection: function(bconn, email) {
    var context, self = this;
    if (!this._emailToClientContext.hasOwnProperty(email)) {
      context = this._emailToClientContext[email] =
        new ClientContext(this, email);
    }
    else {
      context = this._emailToClientContext[email];
    }
    return $Q.when(context.clientPromise, function(client) {
      bconn.sessionCookie = makeSessionCookie();
      self._sessionCookieToLiveConnection[bconn.sessionCookie] = bconn;
      bconn.attachToBackside(new $backside.ModaBackside(
        client, bconn.sessionCookie, context._log));
    });
  },

  maybeRestoreConnection: function(bconn, stateCheck) {
    var existing = null;
    if (this._sessionCookieToLiveConnection.hasOwnProperty(
          stateCheck.sessionCookie)) {
      existing = this._sessionCookieToLiveConnection[stateCheck.sessionCookie];
    }
    else if (this._sessionCookieToDeadConnection.hasOwnProperty(
               stateCheck.sessionCookie)) {
      existing = this._sessionCookieToDeadConnection[stateCheck.sessionCookie];
      delete this._sessionCookieToDeadConnection[stateCheck.sessionCookie];
    }
    else {
      return false;
    }
    var isGood = (existing.outSeqNo === stateCheck.serverSeq) &&
                 (existing.inSeqNo === stateCheck.clientSeq);
    if (!isGood) {
      delete this._sessionCookieToLiveConnection[stateCheck.sessionCookie];
      return false;
    }

    this._sessionCookieToLiveConnection[stateCheck.sessionCookie] = bconn;
    bconn.attachToBackside(existing.backside);
    existing.context.migrateConn(existing, bconn);
    return true;
  },
};

function BridgeConn(tracker, conn) {
  this._log = LOGFAB.dumbConn(this, tracker._log,
                              [conn.socket.remotePort, 'unauthed']);
  this.tracker = tracker;
  this.conn = conn;

  this.clientContext = null;
  this.backside = null;

  this.sessionCookie = null;
  this.timerHandle = null;
  /**
   * How many mode backside messages have we sent?  Used for 'restore' to verify
   *  synchronization.  This gets clobbered into the messages we send as we do
   *  so so the other side can tell us when it attempts to restore.
   */
  this.outSeqNo = 0;
  /**
   * How many moda backside messages have we received?
   */
  this.inSeqNo = 0;

  conn.on('error', this.onError.bind(this));
  conn.on('close', this.onClose.bind(this));
  conn.on('message', this.onMessage.bind(this));
}
BridgeConn.prototype = {
  onError: function() {
  },

  onClose: function() {
    this.conn = null;
    if (this.backside)
      this.goZombie();
    else
      this.tracker.reportDeadConn(this, false);
  },

  onMessage: function(rawMsg) {
    var msg = JSON.parse(rawMsg.utf8Data), self = this;
    if (this.backside) {
      this.inSeqNo++;
      this.backside._received(msg);
      return;
    }

    // - login!
    if (msg.type === 'assertion') {
      this._log.verifyAssertion_begin();
      $persona.verify({
        assertion: msg.assertion,
        // it seems to ignore the port, although that is wrong in terms of
        //  origin determination
        audience: this.tracker.serverConfig.hostname,
      }, function verified(err, r) {
        self._log.verifyAssertion_end();
        if (err) {
          self._log.badPersonaAssertion(err);
          self.conn.sendUTF(JSON.stringify({
            type: 'badverify'
          }));
          self.conn.close();
          return;
        }
        self._log.verified(r.email);
        self._log.__updateIdent([self.conn.socket.remotePort,
                                 r.email]);

        // verification succeeded, hook it up, then send a success marker
        $Q.when(self.tracker.hookupVerifiedConnection(self, r.email),
          function() {
            self.conn.sendUTF(JSON.stringify({
              type: 'success',
              sessionCookie: self.sessionCookie,
            }));
          });
      });
    }
    // - attempting to restore connection state
    else if (msg.type === 'restore') {
      if (this.tracker.maybeRestoreConnection(this, msg)) {
        this.conn.sendUTF(JSON.stringify({
          type: 'restored',
          sessionCookie: this.sessionCookie,
          clientSeq: msg.clientSeq,
          serverSeq: msg.serverSeq,
        }));
      }
      else {
        this.conn.sendUTF(JSON.stringify({
          type: 'badrestore',
        }));
        this.conn.close();
      }
    }

  },

  attachToBackside: function(backside) {
    this.backside = backside;
    backside._sendObjFunc = this._sendObj.bind(this);
  },

  goZombie: function() {
    this.tracker.reportZombieConn(this);
    this.timerInterval = setTimeout(
      this.dieZombie.bind(this), ZOMBIE_DURATION_MS);
  },

  dieZombie: function() {
    // we are already super dead if our backside is nulled out
    if (!this.backside)
      return;
    if (this.timerInterval) {
      clearTimeout(this.timerInterval);
      this.timerInterval = null;
    }
    this.backside.dead();
    this.backside = null;
    var contextDied = this.context.handleDeadConn(this);
    this.tracker.reportDeadConn(this, true, contextDied);
  },

  _sendObj: function(obj) {
    // if we are a zombie, this message is going to cause a desync, so we should
    //  just die
    // XXX we could also attempt to perform some type of limited buffering for
    //  this situation before offing ourselves.
    if (!this.conn) {
      this.dieZombie();
      return;
    }
    this.outSeqNo++;
    this.conn.sendUTF(JSON.stringify(obj));
  },
};

exports.dbSchemaDef = {
  tables: [
    {
      name: TBL_USER_ACCOUNTS,
      columnFamilies: ['d'],
      indices: [],
    },
  ],
  queues: [
  ],
};

exports.makeServerDef = function(serverConfig) {
  // XXX once we get an optimization step happening, then we can copy this
  //  out from serverConfig.devMode.  Also, we need a way to specify dev mode.
  var devMode = true, staticOptions, depsPath, mobuiPath, dumbwebPath,
      rdcommonLibPath;
  // we always run out of our 'lib' directory
  var rootDir = '../../';

  if (devMode) {
    var clientsPath = $path.join(rootDir, 'clients');
    depsPath = $path.join(clientsPath, 'deps');
    mobuiPath = $path.join(clientsPath, 'mobileui');
    dumbwebPath = $path.join(clientsPath, 'dumbweb');
    rdcommonLibPath = $path.join(rootDir, 'common/lib/rdcommon');

    staticOptions = {
      // this gets updated for each request
      root: null,
      maxAge: 5 * 1000,
    };
  }
  else {
    staticOptions = {
      root: $path.resolve(rootDir,
                          'servers/',
                          'build/dumbweb'),
      maxAge: 60 * 60 * 1000,
    };
    throw new Error("How are we not in dev mode?");
  }

  var connectionTracker = new ConnectionTracker(serverConfig);

  function fmap(root, path) {
    return function(request, response, next) {
      staticOptions.root = root;
      staticOptions.path = path;
      staticOptions.getOnly = true;
      return $static.send(request, response, next, staticOptions);
    };
  }

  return {
    endpoints: {},
    rawEndpoints: {
      'dumbweb.bridge': {
        checkRequest: function(protocol, request) {
          // XXX we should probably enforce origin constraints on this!
          return true;
        },
        processRequest: function(protocol, request, rawConn) {
          connectionTracker.makeConnection(rawConn);
        },
      },
    },
    urls: {
      // Use a redirect for path consistency with how the mobile UI does it so
      //  things actually load.
      '/': function(request, response) {
        response.statusCode = 301;
        response.setHeader('Location', '/dumbweb/mobileui/index.html');
        response.end('Redirecting to mobile UI');
      },
      // front-run the UI...
      '/dumbweb/mobileui/js/main.js': fmap(dumbwebPath, '/frontrun-main.js'),
      // ..and expose the real UI somewhere accessible.
      '/dumbweb/mobileui/js/real-main.js': fmap(mobuiPath, '/js/main.js'),
      // modality comes from dumbweb
      '/dumbweb/deps/modality.js': fmap(dumbwebPath, '/modality.js'),
    },
    rootDirs: {
      'dumbweb': function(relpath, request, response, next) {
        if (relpath.lastIndexOf('/deps/', 0) === 0) {
          relpath = relpath.substring(5);
          if (relpath.lastIndexOf('/rdcommon/', 0) === 0) {
            staticOptions.root = rdcommonLibPath;
            staticOptions.path = relpath.substring(9);
          }
          else {
            staticOptions.root = depsPath;
            staticOptions.path = relpath;
          }
        }
        else if (relpath.lastIndexOf('/mobileui/', 0) === 0) {
          staticOptions.root = mobuiPath;
          staticOptions.path = relpath.substring(9);
        }
        else {
          return next();
        }

        staticOptions.getOnly = true;
        return $static.send(request, response, next, staticOptions);
      },
    },
  };
};

});
