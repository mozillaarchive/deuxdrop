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

require(
  {
    baseUrl: "../../",
    packages: [
    ],
    paths: {
      rdservers: "servers/lib/rdservers",
      rdcommon: "common/lib/rdcommon",
      rdstests: "servers/test",
      rdctests: "common/test",
    },
  },
  [
    "nomnom",
    "q",
    "require"
  ],
  function(
    $nomnom,
    $Q,
    $require
  ) {
var when = $Q.when;

var DEATH_PRONE = false;
process.on("uncaughtException",
  function(err) {
    console.error("==== UNCAUGHT ====");
    console.error(err.stack);
    if (DEATH_PRONE)
      process.exit(1);
  });

var DEFAULT_WATCHDOG_TIMEOUT = 3 * 60 * 1000;
function deathClock(timeout) {
  if (timeout === undefined)
    timeout = DEFAULT_WATCHDOG_TIMEOUT;
  DEATH_PRONE = true;
  setTimeout(function() {
    console.log("WATCHDOG KILLIN");
    process.exit(10);
  }, timeout);
}

var parser = $nomnom.globalOpts({
});

var OPT_CONFIG_DIR = {
  position: 1,
  help: "The directory that holds/should hold server (configuration) data"
};
var OPT_SERVER_TYPE = {
  string: "--server-type",
  default: "fullpub",
  help: "One of: fullpub, halfpub, halfpriv"
};
var OPT_HBASE_PREFIX = {
  string: "--hbase-prefix",
  default: "",
  help: "Optional namespacing prefix for the hbase table names",
};
var OPT_LISTEN_PORT = {
  string: "--listen-port",
  required: true,
  help: "The port the server should listen on.",
};

parser.command('define-server')
  .help("Define a server configuration to run.")
  .opts({
    configDir: OPT_CONFIG_DIR,
    serverType: OPT_SERVER_TYPE,
    hbasePrefix: OPT_HBASE_PREFIX,
    listenPort: OPT_LISTEN_PORT,
  })
  .callback(function(options) {
    $require(['rdservers/configurer'], function($configurer) {
      $configurer.createConfig(ops.configDir, opts);
    });
  });

parser.command('run-server')
  .help("Run an already defined server configuration.")
  .opts({
    configDir: OPT_CONFIG_DIR,
  })
  .callback(function(options) {
    $require(['rdservers/configurer'], function($configurer) {
      $configurer.runConfig(opts.configDir);
    });
  });

parser.command('nuke-server')
  .help("Cleanup a previously defined server (hbase and file-system)")
  .opts({
    configDir: OPT_CONFIG_DIR,
  })
  .callback(function(options) {
    $require(['rdservers/configurer'], function($configurer) {
      $configurer.nukeConfig(opts.configDir);
    });
  });


parser.command('test')
  .help("Run tests!")
  .opts({
  })
  .callback(function(options) {
    process.on('exit', function(code) {
      debugger;
      console.log("EXIT EVENT", code);
    });

    deathClock(30 * 1000);
    // Ideally we could slurp this from requirejs... and maybe we can, but for
    //  now...
    var testPrefixToPathMap = {
      'rdstests/': '../../servers/test',
      'rdctests/': '../../common/test',
    };
    // XXX !!! obviously, we want this to find tests, not have them be hardcoded
    $require(['rdcommon/testdriver'],
             function($driver) {
      when($driver.runTestsFromDirectories(testPrefixToPathMap),
        function() {
console.error("all test runs complete per promise");
          process.exit(0);
        });
console.error("cmdline callback complete");
    });
  });

// We need to do our own argv slicing to compensate for RequireJS' r.js
parser.parseArgs(process.argv.slice(3));

}); // end require
