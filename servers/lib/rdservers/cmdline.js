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


var DEATH_PRONE = false;
var SUPER_DEBUG = false;

var ErrorTrapper = {
  _trappedErrors: null,
  _handlerCallback: null,
  /**
   * Express interest in errors.
   */
  trapErrors: function() {
    this._trappedErrors = [];
  },
  callbackOnError: function(handler) {
    this._handlerCallback = handler;
    this._trappedErrors = [];
  },
  yoAnError: function(err, moduleName) {
    if (this._trappedErrors == null || SUPER_DEBUG) {
      console.error("==== REQUIREJS ERR ====", moduleName);
      console.error(err.message);
      console.error(err.stack);
      if (DEATH_PRONE) {
        console.error("PERFORMING PROCESS EXIT");
        process.exit(1);
      }
    }
    if (this._handlerCallback)
      this._handlerCallback(err, moduleName);
    else if (this._trappedErrors)
      this._trappedErrors.push(err);
  },
  gobbleAndStopTrappingErrors: function() {
    this._handlerCallback = null;
    var errs = this._trappedErrors;
    this._trappedErrors = null;
    return errs;
  },
};

require.onError = function(err) {
  //console.error("(Exception)");
  //console.error("RJS EX STACK", err.message, err.stack);

  var useErr = err;
  if (err.originalError)
    useErr = err.originalError;
  ErrorTrapper.yoAnError(useErr, err.moduleName);
};


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
    require
  ) {
var when = $Q.when;

process.on("uncaughtException",
  function(err) {
    console.error("==== UNCAUGHT ====");
    console.error(err.message);
    console.error(err);
    console.error(err.stack);
    if (DEATH_PRONE)
      process.exit(1);
  });

var DEFAULT_WATCHDOG_TIMEOUT = 3 * 60 * 1000;
function deathClock(timeout, nonfatal) {
  if (timeout === undefined)
    timeout = DEFAULT_WATCHDOG_TIMEOUT;
  if (!nonfatal)
    DEATH_PRONE = true;
  setTimeout(function() {
    console.error("WATCHDOG KILLIN");
    process.exit(10);
  }, timeout);
}

var parser = $nomnom.globalOpts({
  superDebug: {
    string: "--super-debug",
    default: false,
    help: "Should we crank the logging up so that it emits to the console?",
  },
});

function applyGlobalOptions(options) {
  if (options.superDebug) {
    console.error("SUPER DEBUG");
    SUPER_DEBUG = true;
  }
};


var OPT_CONFIG_DIR = {
  position: 1,
  help: "The directory that holds/should hold server (configuration) data"
};
var OPT_SERVER_TYPE = {
  string: "--server-type=TYPE",
  default: "fullpub",
  help: "One of: fullpub, halfpub, halfpriv"
};
var OPT_HBASE_PREFIX = {
  string: "--hbase-prefix=PREFIX",
  default: "",
  help: "Optional namespacing prefix for the hbase table names",
};
var OPT_LISTEN_PORT = {
  string: "--listen-port=PORT",
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
    require(['rdservers/configurer'], function($configurer) {
      $configurer.cmdCreateConfig(ops.configDir, opts);
    });
  });

parser.command('run-server')
  .help("Run an already defined server configuration.")
  .opts({
    configDir: OPT_CONFIG_DIR,
  })
  .callback(function(options) {
    require(['rdservers/configurer'], function($configurer) {
      $configurer.cmdRunConfig(opts.configDir);
    });
  });

parser.command('nuke-server')
  .help("Cleanup a previously defined server (hbase and file-system)")
  .opts({
    configDir: OPT_CONFIG_DIR,
  })
  .callback(function(options) {
    require(['rdservers/configurer'], function($configurer) {
      $configurer.cmdNukeConfig(opts.configDir);
    });
  });

parser.command('fake-in-one')
  .help("All-in-one fake server with node-hosted crammed-in clients using " +
        "the fake-server bridge; NEVER USE IN THE REAL WORLD AT ALL.")
  .opts({
    webPort: {
      string: "--web-port",
      default: 8888,
      help: "What port should we listen on to be fake on?",
    },
  })
  .callback(function(options) {
    applyGlobalOptions(options);
    require(['rdservers/fakefakeserver'], function($doublefake) {
      $doublefake.goForthAndBeFake(options.webPort);
    });
  });

parser.command('echo-server')
  .help("Run an echo server for jetpack/gecko authconn tests.")
  .opts({
    port: {
      string: "--port",
      default: 9232,
      help: "What port should we bind on?",
    },
  })
  .callback(function(options) {
    applyGlobalOptions(options);
    require(['rdservers/echotestserver'], function($echotest) {
      $echotest.echoServe(options.port);
    });
  });

parser.command('test')
  .help("Run tests!")
  .opts({
    specificTest: {
      position: 1,
      default: null,
      help: "(optional: The require name of a specific test to run)",
    },
  })
  .callback(function(options) {
    process.on('exit', function(code) {
      debugger;
      console.log("EXIT EVENT", code);
    });

    applyGlobalOptions(options);

    // Ideally we could slurp this from requirejs... and maybe we can, but for
    //  now...
    var testPrefixToPathMap = {
      'rdstests/': '../../servers/test',
      'rdctests/': '../../common/test',
    };
    // -- specific test
    if (options.specificTest) {
      deathClock(20 * 1000, true);
      require(['rdcommon/testdriver'],
               function($driver) {
        when($driver.runTestsFromModule(options.specificTest, ErrorTrapper,
                                        SUPER_DEBUG),
          function() {
//console.error("  !! performing exit");
            // pass or fail, we want to exit normally; only the death clock
            //  should result in a non-zero exit.
            process.exit(0);
          });
      });
    }
    // -- scan for tests (which uses child processes to invoke specific tests)
    else {
      deathClock(90 * 1000, true);
      require(['rdcommon/testdriver'],
               function($driver) {
        when($driver.runTestsFromDirectories(testPrefixToPathMap,
                                             ErrorTrapper),
          function() {
            process.exit(0);
          });
      });
    }
  });

// We need to do our own argv slicing to compensate for RequireJS' r.js
parser.parseArgs(process.argv.slice(3));

}); // end require
