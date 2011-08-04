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
 * XXX not fully implemented; this is being written piecemeal with the unit tests
 *  to make sure we don't get too unit test specific.
 **/

define(function(require, exports) {

var $fs = require('fs'), $path = require('path'),
    $Q = require('q');

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
};

function ServerConfig(keyring, selfIdentBlob, dbConn) {
  this.keyring = keyring;
  this.selfIdentBlob = selfIdentBlob;
  this.db = dbConn;
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

  mergeInDbSchema: function(dbSchema) {
  },

  __registerServers: function(server) {
    for (var i = 0; i < this._serverModules.length; i++) {
      server.registerServer(
        this._serverModules[i].makeServerDef(this));
    }
  },
};

var FULLPUB_ROLES = exports.FULLPUB_ROLES =
  ['auth', 'signup', 'drop', 'sender', 'fanout', 'store'];

function createServerConfigFromScratch(url, dbConn, _logger) {
  var rootKeyring = $keyring.createNewServerRootKeyring(),
      keyring = rootKeyring.issueLongtermBoxingKeyring();

  var details = {
    tag: 'server:fakefake',
    url: url,
  };
  var signedSelfIdent =
    $pubident.generateServerSelfIdent(rootKeyring, keyring, details);

  // yes, we are throwing away the root ring.
  return populateTestConfig(keyring, signedSelfIdent, dbConn,
                            FULLPUB_ROLES, _logger);
}

const TBL_SERVER_IDENTITY = 'server:identity';

/**
 * Stop-gap serving starting mechanism driven by the fake-in-one server's need
 *  to create a persistent server.
 */
exports.loadOrCreateAndPersistServerJustMakeItGo = function(dbConn, hostname,
                                                            port, _logger) {
  var url = 'ws://' + hostname + ':' + port + '/';
  return $Q.when(dbConn.getRowCell(TBL_SERVER_IDENTITY, 'me', 'p:me'),
    function(jsonStr) {
      var serverConfig;
      if (!jsonStr) {
        serverConfig = createServerConfigFromScratch(url, dbConn, _logger);
        dbConn.putCells(TBL_SERVER_IDENTITY, 'me',
          {
            'p:me': {
              keyring: serverConfig.data,
              selfIdentBlob: serverConfig.selfIdentBlob,
            }
          });
      }
      else {
        var persisted = JSON.parse(jsonStr);
        serverConfig = populateTestConfig(
                         $keyring.loadLongtermBoxingKeyring(persisted.keyring),
                         persisted.selfIdentBlob,
                         dbConn,
                         FULLPUB_ROLES,
                         _logger);

        var server = serverConfig.__server =
          new $authconn.AuthorizingServer(_logger);
        server.listen(port);
      }

      return serverConfig;
    },
    function() {
      console.error("DB problem loading server information.");
    });
};

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
  var serverConfig = new ServerConfig(keyring, selfIdentBlob, dbConn);

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
const CONFIG_FILE_NAME = 'config.json';

function saveConfigToDir(config, configDir) {
  var jsonConfig = JSON.stringify(config, null, 2);
  var configFilePath = $path.join(configDir, CONFIG_FILE_NAME);
  $fs.writeFileSync(configFilePath, jsonConfig);
}

function loadConfigFromDir(configDir) {
  var configFilePath = $path.join(configDir, CONFIG_FILE_NAME);
  if (!$path.existsSync(configFilePath))
    throw new Error("The configuration file '" + configFilePath +
                    "' does not exist!");

  var jsonConfig = $fs.readFileSync(configFilePath);
  return JSON.parse(jsonConfig);
}

////////////////////////////////////////////////////////////////////////////////
// Command-Line Commands
//
// Speculative commands already speculatively called by the command-line.

/**
 * Create a server configuration from scratch.
 */
exports.cmdCreateConfig = function createConfig(configDir, opts) {
  // -- explode if the directory already exists
  if ($path.existsSync(configDir))
    throw new Error("configuration directory '" + configDir +
                    "' already exists!");

  // - create the directory
  $fs.mkdirSync(configDir, CONFIG_DIR_MODE);

  // - create the keys / identity

  saveConfigToDir(config, configDir);
};

exports.cmdRunConfig = function runConfig(configDir) {
  var config = loadConfigFromDir(configDir);

  // -- instantiate the server


  // -- bundle up the endpoints for the server def
};

exports.cmdNukeConfig = function nukeConfig(configDir) {
  var config = loadConfigFromDir(configDir);

  // -- perform hbase cleanup
};

////////////////////////////////////////////////////////////////////////////////

}); // end define
