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

define(
  [
    'fs', 'path',
    'exports'
  ],
  function(
    $fs, $path,
    exports
  ) {

const CONFIG_DIR_MODE = parseInt("700", 8);
const CONFIG_FILE_NAME = 'config.json';

function ServerConfig(keyring, selfIdentBlob) {
  this.keyring = keyring;
  this.selfIdentBlob = selfIdentBlob;
}
ServerConfig.prototype = {
};

function saveConfig(config, configDir) {
  var jsonConfig = JSON.stringify(config, null, 2);
  var configFilePath = $path.join(configDir, CONFIG_FILE_NAME);
  $fs.writeFileSync(configFilePath, jsonConfig);
}

function loadConfig(configDir) {
  var configFilePath = $path.join(configDir, CONFIG_FILE_NAME);
  if (!$path.existsSync(configFilePath))
    throw new Error("The configuration file '" + configFilePath +
                    "' does not exist!");

  var jsonConfig = $fs.readFileSync(configFilePath);
  return JSON.parse(jsonConfig);
}

/**
 * Create a server configuration from scratch.
 */
exports.createConfig = function createConfig(configDir, opts) {
  // -- explode if the directory already exists
  if ($path.existsSync(configDir))
    throw new Error("configuration directory '" + configDir +
                    "' already exists!");

  // - create the directory
  $fs.mkdirSync(configDir, CONFIG_DIR_MODE);

  // - create the keys / identity

  saveConfig(config, configDir);
};

/**
 * Populate a `ServerConfig` for a unit test that has already done most of the
 *  legwork itself.
 */
exports.__populateTestConfig = function populateTestConfig(keyring,
                                                           selfIdentBlob) {
  return new ServerConfig(keyring, selfIdentBlob);
};

exports.runConfig = function runConfig(configDir) {
  var config = loadConfig(configDir);

  // -- instantiate the server


  // -- bundle up the endpoints for the server def
};

exports.nukeConfig = function nukeConfig(configDir) {
  var config = loadConfig(configDir);

  // -- perform hbase cleanup
};

}); // end define
