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
 * Configuration handling.  All file I/O is synchronous because the system is,
 *  by definition, not doing anything interesting before we load the
 *  configuration.
 *
 * XXX not fully implemented; this is being written piecemeal with the unit
 *  tests to make sure we don't get too unit test specific.
 **/

define(function(require, exports, $module) {

var $fs = require('fs'), $path = require('path'),
    $Q = require('q'), when = $Q.when;

var $log = require('rdcommon/log'),
    $gendb = require('rdplat/gendb');

var $keyring = require('rdcommon/crypto/keyring'),
    $pubident = require('rdcommon/identities/pubident'),
    $authconn = require('rdcommon/transport/authconn');

var $signup_server = require('rdservers/signup/server'),
    $authdb_api = require('rdservers/authdb/api'),
    $maildrop_local_api = require('rdservers/maildrop/localapi'),
    $maildrop_server = require('rdservers/maildrop/server'),
    $mailsender_local_api = require('rdservers/mailsender/localapi'),
    $mailstore_api = require('rdservers/mailstore/api'),
    $mailstore_server = require('rdservers/mailstore/server'),
    $fanout_api = require('rdservers/fanout/api');

var $debuglog_server = require('rdservers/debuglog/server');

/**
 * Server roles in a weakly ordered sequence.
 */
var SERVER_ROLE_MODULES = {
  auth: {
    apiModule: $authdb_api,
    serverModule: null,
  },
  signup: {
    apiModule: null,
    serverModule: $signup_server,
  },
  drop: { // needs 'auth'
    apiModule: $maildrop_local_api,
    serverModule: $maildrop_server,
  },
  sender: {
    apiModule: $mailsender_local_api,
    serverModule: null,
  },
  fanout: {
    apiModule: $fanout_api,
    serverModule: null,
  },
  store: {
    apiModule: $mailstore_api,
    serverModule: $mailstore_server,
  },
  debuglog: {
    apiModule: null,
    serverModule: $debuglog_server,
  },
};

/**
 * Central configuration and rendezvous mechanism for all server bits.  Besides
 *  the explicitly documented attributes, all of the SERVER_ROLE_MODULE
 *  apiModules get annotated on.  So "auth"'s "apiModule" gets instantiated and
 *  becomes "authApi", "sender"'s "apiModule" becomes "senderApi" and so on.
 */
function ServerConfig(keyring, selfIdentBlob, dbConn, rootLogger) {
  this.keyring = keyring;
  this.selfIdentBlob = selfIdentBlob;
  this.db = dbConn;
  this.rootLogger = rootLogger;
  this._serverModules = [];
  this.aggrDbSchema = {
    tables: [],
    queues: [],
  };
}
ServerConfig.prototype = {
  toString: function() {
    return '[ServerConfig]';
  },
  toJSON: function() {
    return {
      type: 'ServerConfig',
    };
  },

  /**
   * Merge a server's db schema into our aggregate schema.  This is required
   *  because our gendb implementation only wants to define a schema once.
   */
  mergeInDbSchema: function(dbSchema) {
    this.aggrDbSchema.tables = this.aggrDbSchema.tables.concat(dbSchema.tables);
    this.aggrDbSchema.queues = this.aggrDbSchema.queues.concat(dbSchema.queues);
  },

  /**
   * Register all known server modules with the provided authconn server so that
   *  their endpoints get registered.
   */
  __registerServers: function(server) {
    for (var i = 0; i < this._serverModules.length; i++) {
      server.registerServer(
        this._serverModules[i].makeServerDef(this));
    }
  },
};

var FULLPUB_ROLES = exports.FULLPUB_ROLES =
  ['auth', 'signup', 'drop', 'sender', 'fanout', 'store'];

const TBL_SERVER_IDENTITY = 'server:identity';

/**
 * Populate a `ServerConfig` for a unit test that has already done most of the
 *  legwork itself.  This exists because unit tests take whatever port they
 *  can get and can't know it a priori.
 *
 * @args[
 *   @param[keyring]
 *   @param[selfIdentBlob]
 *   @param[dbConn GenDbConn]{
 *     The database connection to be shared amongst all roles of this server.
 *   }
 *   @param[clobberNamespace @dictof[
 *     @key[targetAttrName]{
 *       The name on the `ServerConfig` that is attempting to be replaced.  For
 *       example, "senderApi" should be used when attempting to replace the
 *       senderApi with a decorated instance.
 *     }
 *     @value[testFriendlyModule]{
 *       If replacing an API, the module should expose an ApiWrapFactory method,
 *       presumably created by `testwrapmaker.js`.
 *     }
 *   ]]{
 *     Allows the test to replace/wrap apis.
 *   }
 * ]
 */
var populateTestConfig = exports.__populateTestConfig =
    function populateTestConfig(keyring, selfIdentBlob, dbConn, roles,
                                clobberNamespace, _logger) {
  var serverConfig = new ServerConfig(keyring, selfIdentBlob, dbConn, _logger);

  for (var iRole = 0; iRole < roles.length; iRole++) {
    var roleName = roles[iRole];
    var serverRoleInfo = SERVER_ROLE_MODULES[roleName];
    if (serverRoleInfo.apiModule) {
      // - augment schema
      if (serverRoleInfo.apiModule.hasOwnProperty("dbSchemaDef"))
        serverConfig.mergeInDbSchema(serverRoleInfo.apiModule.dbSchemaDef);

      // - instantiate, checking clobber
      if (clobberNamespace.hasOwnProperty(roleName + 'Api')) {
        serverConfig[roleName + 'Api'] =
          clobberNamespace[roleName + 'Api'].ApiWrapFactory(_logger,
              [serverConfig, dbConn, _logger]);
      }
      else {
        serverConfig[roleName + 'Api'] =
          new serverRoleInfo.apiModule.Api(serverConfig, dbConn, _logger);
      }
    }
    if (serverRoleInfo.serverModule)
      serverConfig._serverModules.push(serverRoleInfo.serverModule);
  }
  return serverConfig;
};


////////////////////////////////////////////////////////////////////////////////
// Directory-Based Persistence

const CONFIG_DIR_MODE = parseInt("700", 8);
/**
 * The file that contains the root keyring info and no one really needs for
 *  anything.  We just persist it because we might need it some day.
 */
const ROOTKEY_FILE_NAME = 'rootkeyring.json';
/**
 * The configuration file proper that contains the infor required to run the
 *  server.
 */
const CONFIG_FILE_NAME = 'config.json';

function saveConfigFileToDir(config, filename, configDir) {
  var jsonConfig = JSON.stringify(config, null, 2);
  var configFilePath = $path.join(configDir, filename);
  $fs.writeFileSync(configFilePath, jsonConfig);
}

function loadConfigFileFromDir(filename, configDir) {
  var configFilePath = $path.join(configDir, filename);
  if (!$path.existsSync(configFilePath))
    throw new Error("The configuration file '" + configFilePath +
                    "' does not exist!");

  var jsonConfig = $fs.readFileSync(configFilePath);
  return JSON.parse(jsonConfig);
}

const SELF_IDENT_FILE = 'deuxdrop-server.selfident',
      SELF_IDENT_JSON_FILE = 'deuxdrop-server.selfident.json';

function saveSelfIdentOff(signedSelfIdent, configDir) {
  var path = $path.join(configDir, SELF_IDENT_FILE);
  $fs.writeFileSync(path, signedSelfIdent);
  path = $path.join(configDir, SELF_IDENT_JSON_FILE);
  $fs.writeFileSync(path, JSON.stringify({selfIdent: signedSelfIdent}));
}

const ALL_CONFIG_FILES = [
  ROOTKEY_FILE_NAME,
  CONFIG_FILE_NAME,
  SELF_IDENT_FILE, SELF_IDENT_JSON_FILE,
];

////////////////////////////////////////////////////////////////////////////////
// Command-Line Commands
//
// These are invoked by `rdservers/cmdline.js`; consult that code for details
//  on the options provided to us.

function makedirTree(path, mode) {
  var tomake = [path];
  path = $path.dirname(path);
  while (!$path.existsSync(path)) {
    tomake.push(path);
    path = $path.dirname(path);
  }
  while (tomake.length) {
    $fs.mkdirSync(tomake.pop(), mode);
  }
}

/**
 * Normalize the configuration path to compensate for the fact that while the
 *  cmdline script lives in 'servers' we run from 'servers/lib' by prefixing
 *  '../' to relative paths.
 */
function normalizeConfigPath(path) {
  if (path[0] !== '/')
    return '../' + path;
  return path;
}

/**
 * Create a server configuration from scratch.
 */
exports.cmdCreateConfig = function createConfig(configDir, opts) {
  configDir = normalizeConfigPath(configDir);

  if (opts.announcePort === 0)
    opts.announcePort = opts.listenPort;

  // -- explode if the directory already exists
  if ($path.existsSync(configDir))
    throw new Error("configuration directory '" + configDir +
                    "' already exists!");
  console.log("creating", configDir);

  // - create the directory
  makedirTree(configDir, CONFIG_DIR_MODE);

  // - create the keys, identity
  var rootKeyring = $keyring.createNewServerRootKeyring();
  var keyring = rootKeyring.issueLongtermBoxingKeyring();

  // details for the self-ident
  var details = {
    tag: 'server:full',
    meta: {
      displayName: opts.humanName,
    },
    url: 'ws://' + opts.dnsName + ':' + opts.announcePort + '/',
  };

  var signedSelfIdent =
    $pubident.generateServerSelfIdent(rootKeyring, keyring, details);


  var serializedConfig = {
    keyring: keyring.data,
    signedSelfIdent: signedSelfIdent,
    dbKind: 'redis',
    dbServer: opts.dbServer,
    dbPort: opts.dbPort,
    dbPrefix: opts.dbPrefix,
    listenIP: opts.listenIP,
    listenPort: opts.listenPort,
    announcePort: opts.announcePort,
  };

  // - persist
  saveConfigFileToDir(rootKeyring.data, ROOTKEY_FILE_NAME, configDir);
  saveConfigFileToDir(serializedConfig, CONFIG_FILE_NAME, configDir);

  // save off the self-ident to its own file so that it can be placed in
  //  a 'well known location' to be served by a different webserver.
  saveSelfIdentOff(signedSelfIdent, configDir);
};

var ALIVE_LIST = [];

/**
 * Run an existing server configuration.
 */
exports.cmdRunConfig = function runConfig(configDir, debugLogging) {
  configDir = normalizeConfigPath(configDir);
  var liveServerInfo = {};

  // - depersist the config
  var serializedConfig = loadConfigFileFromDir(CONFIG_FILE_NAME, configDir);

  var keyring = $keyring.loadLongtermBoxingKeyring(serializedConfig.keyring);

  // - logger
  var logger = LOGFAB.serverConfig(liveServerInfo, null,
                                   [configDir, keyring.boxingPublicKey]);

  // - db connection
  var dbConn = $gendb.makeProductionDBConnection(serializedConfig.dbPrefix,
                                                 serializedConfig.dbServer,
                                                 serializedConfig.dbPort,
                                                 logger);

  // - authconn server instance
  var server = new $authconn.AuthorizingServer(logger,
                                               keyring.boxingPublicKey);

  var roles = FULLPUB_ROLES.concat();

  // - debug logging hookup
  if (debugLogging)
    roles.push('debuglog');

  // - server config
  var serverConfig = populateTestConfig(keyring,
                                        serializedConfig.signedSelfIdent,
                                        dbConn,
                                        roles,
                                        {}, // no clobbering (just for tests)
                                        logger);

  // - stash info in a global
  // this is partially so we can find it more easily with a debugger, partially
  //  GC superstition :)
  liveServerInfo.server = server;
  liveServerInfo.serverConfig = serverConfig;
  ALIVE_LIST.push(liveServerInfo);

  serverConfig.__registerServers(server);

  // - start server
  server.listen(serializedConfig.listenIP, serializedConfig.listenPort);
  console.log("Server started on",
              serializedConfig.listenIP, serializedConfig.listenPort);
};

function nukeFilesInDir(dir, files) {
  for (var i = 0; i < files.length; i++) {
    var nukePath = $path.join(dir, files[i]);
    try {
      $fs.unlinkSync(nukePath);
    }
    catch(ex) {
      // no one cares if they are already gone
    }
  }
}

/**
 * Delete an existing configuration, which just means wiping out the database
 *  and then deleting the configuration directory.
 *
 * The caller is responsible for doing the "are you sure you want to do this"
 *  checking (and it does).
 */
exports.cmdNukeConfig = function nukeConfig(configDir) {
  configDir = normalizeConfigPath(configDir);
  var serializedConfig = loadConfigFileFromDir(CONFIG_FILE_NAME, configDir);

  var keyring = $keyring.loadLongtermBoxingKeyring(serializedConfig.keyring);

  var logger = LOGFAB.serverConfig(null, null,
                                   [configDir, keyring.boxingPublicKey]);

  // - nuke database
  var dbConn = $gendb.makeProductionDBConnection(serializedConfig.dbPrefix,
                                                 serializedConfig.dbServer,
                                                 serializedConfig.dbPort,
                                                 logger);
  function badNews(err) {
    console.error("PROBLEM:", err);
    process.exit(11);
  };

  return when($gendb.nukeProductionDatabase(dbConn), function() {
    $gendb.closeProductionDBConnection(dbConn);

    // - delete directory
    nukeFilesInDir(configDir, ALL_CONFIG_FILES);
    $fs.rmdirSync(configDir);
  }, badNews);
};

////////////////////////////////////////////////////////////////////////////////
// Log Def

var LOGFAB = exports.LOGFAB = $log.register($module, {
  serverConfig: {
    type: $log.DAEMON,
    subtype: $log.DAEMON,
    semanticIdent: {
      configName: 'configName',
      serverIdent: 'key',
    },
    stateVars: {
      connState: true,
      appState: true,
    },
    events: {
      connecting: {fullUrl: false},
      connected: {},
      send: {type: true},
      receive: {type: true},
      closing: {},
      closed: {},
    },
    TEST_ONLY_events: {
      send: {msg: $log.JSONABLE},
      receive: {msg: $log.JSONABLE},
    },
    calls: {
      appConnectHandler: {},
      handleMsg: {type: true},
      appCloseHandler: {},
    },
    TEST_ONLY_calls: {
      handleMsg: {msg: $log.JSONABLE},
    },
    errors: {
      connectError: {error: false},
      connectFailed: {error: false},

      corruptServerEphemeralKey: {},

      badProto: {},
      corruptBox: {},

      badMessage: {inState: true, type: true},
      queueBacklogExceeded: {},
      websocketError: {err: false},
      handlerFailure: {err: $log.EXCEPTION},
    },
    LAYER_MAPPING: {
      layer: "protocol",
      transitions: [
        {after: {connState: "app"}, become: "app"},
      ],
    },
  },
});

////////////////////////////////////////////////////////////////////////////////

}); // end define
