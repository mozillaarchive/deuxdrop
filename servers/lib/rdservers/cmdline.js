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

  // 'process' helpers pushed out here for dependency reasons across platforms
  on: process.on.bind(process),
  once: process.once.bind(process),
  removeListener: process.removeListener.bind(process),

  reliableOutput: console.error,
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
      rdplat: "servers/lib/rdplat",
      rdcommon: "common/lib/rdcommon",
      rdstests: "servers/test",
      rdctests: "common/test",

      rdutests: "clients/test",
      // this should theoretically be a parameterized path
      rduidriver: "clients/testdrivers/firefox/lib/rduidriver",
    },
    catchError: {
      define: true,
    }
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
  default: "serverdefs/devserver",
  help: "The directory that holds/should hold server (configuration) data"
};
var OPT_SERVER_TYPE = {
  string: "--server-type=TYPE",
  default: "fullpub",
  help: "One of: fullpub. (future: halfpub, halfpriv)"
};
var OPT_DB_SERVER = {
  string: "--db-server=DNS_OR_IP",
  default: "127.0.0.1",
  help: "The database server to use, defaults to localhost via 127.0.0.1",
};
var OPT_DB_PORT = {
  string: "--db-port=PORT",
  default: 6379,
  help: "The database server's port, defaults to redis default (6379)",
};
var OPT_DB_PREFIX = {
  string: "--db-prefix=PREFIX",
  default: "",
  help: "Optional namespacing prefix for the database; essential in hbase",
};
var OPT_HUMAN_NAME = {
  string: "--human-name=NAME",
  default: "A development server",
  help: "The human readable description of your server.",
};
var OPT_DNS_NAME = {
  string: "--dns-name=DNSNAME",
  required: true,
  help: "The DNS name to advertise this server as in its self-ident.",
};
var OPT_LISTEN_IP = {
  string: "--listen-ip=IP",
  default: "0.0.0.0",
  help: "The IP address to listen on; 0.0.0.0 for all IPs, 127.0.0.1 for lo.",
};
var OPT_LISTEN_PORT = {
  string: "--listen-port=PORT",
  required: true,
  help: "The port the server should listen on.",
};
var OPT_ANNOUNCE_PORT = {
  string: "--announce-port=PORT",
  default: 0,
  help: "The port the server should claim to be listening on " +
    "(may differ from the listen port due to iptables rules, etc.)",
};

parser.command('define-server')
  .help("Define a server configuration to run.")
  .opts({
    configDir: OPT_CONFIG_DIR,
    serverType: OPT_SERVER_TYPE,
    dbServer: OPT_DB_SERVER,
    dbPort: OPT_DB_PORT,
    dbPrefix: OPT_DB_PREFIX,
    dnsName: OPT_DNS_NAME,
    humanName: OPT_HUMAN_NAME,
    listenIP: OPT_LISTEN_IP,
    listenPort: OPT_LISTEN_PORT,
    announcePort: OPT_ANNOUNCE_PORT,
  })
  .callback(function(options) {
    require(['rdservers/configurer'], function($configurer) {
      applyGlobalOptions(options);
      try {
        $configurer.cmdCreateConfig(options.configDir, options);
      }
      catch (ex) {
        console.error(ex);
        process.exit(2);
      }
    });
  });

var OPT_LOGGEST_WEB_DEBUG = {
  string: "--loggest-web-debug",
  default: false,
  help: "Enable loggest web debugging interface; friendly but expensive",
};

parser.command('run-server')
  .help("Run an already defined server configuration.")
  .opts({
    configDir: OPT_CONFIG_DIR,
    loggestWebDebug: OPT_LOGGEST_WEB_DEBUG,
  })
  .callback(function(options) {
    require(['rdservers/configurer'], function($configurer) {
      applyGlobalOptions(options);
      try {
        $configurer.cmdRunConfig(options.configDir, options.loggestWebDebug);
      }
      catch (ex) {
        console.error(ex);
        process.exit(3);
      }
    });
  });

parser.command('nuke-server')
  .help("Cleanup a previously defined server (hbase and file-system)")
  .opts({
    configDir: OPT_CONFIG_DIR,
    superSure: {
      string: "--yes-i-am-sure-i-want-to-do-this",
      flag: true,
    },
  })
  .callback(function(options) {
    require(['rdservers/configurer'], function($configurer) {
      applyGlobalOptions(options);
      if (!options.superSure) {
        console.error("You need to pass --yes-i-am-sure-i-want-to-do-this");
        process.exit(9);
        return;
      }
      try {
        $configurer.cmdNukeConfig(options.configDir);
      }
      catch (ex) {
        console.error(ex);
        process.exit(4);
      }
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

var OPT_SPECIFIC_TEST = {
  position: 1,
  default: null,
  help: "(optional: The require name of a specific test to run)",
};

function commonTestRun(pathMap, runOptions, options) {
  applyGlobalOptions(options);

  process.on('exit', function(code) {
    debugger;
    console.log("EXIT EVENT", code);
  });

  // -- specific test
  if (options.specificTest) {
    deathClock(runOptions.maxTestDurationMS, true);
    require(['rdcommon/testdriver'],
             function($driver) {
      when($driver.runTestsFromModule(options.specificTest,
                                      runOptions,
                                      ErrorTrapper, SUPER_DEBUG),
        function() {
          // pass or fail, we want to exit normally; only the death clock
          //  should result in a non-zero exit.
          process.exit(0);
        });
    });
  }
  // -- scan for tests (which uses child processes to invoke specific tests)
  else {
    deathClock(runOptions.maxTotalDurationMS, true);
    require(['rdcommon/testdriver'],
             function($driver) {
      when($driver.runTestsFromDirectories(pathMap, runOptions,
                                           ErrorTrapper),
        function() {
          process.exit(0);
        });
    });
  }
}

parser.command('test')
  .help("Run tests!")
  .opts({
    specificTest: OPT_SPECIFIC_TEST,
  })
  .callback(function(options) {
    // Ideally we could slurp this from requirejs... and maybe we can, but for
    //  now...
    var testPrefixToPathMap = {
      'rdstests/': '../../servers/test',
      'rdctests/': '../../common/test',
    };
    var runOptions = {
      testMode: 'test',
      defaultStepDuration: 1 * 1000,
      maxTestDurationMS: 20 * 1000,
      maxTotalDurationMS: 90 * 1000,
      relayArgs: [],
      exposeToTest: {
      },
    };
    commonTestRun(testPrefixToPathMap, runOptions, options);
  });

parser.command('testui')
  .help("Run UI tests for the development UI")
  .opts({
    specificTest: OPT_SPECIFIC_TEST,
    zippedProfile: {
      string: '--zipped-profile=PATH',
      required: true,
      help: 'PATH to the zipped firefox profile to use as a template',
    },
    firefoxBinary: {
      string: '--firefox-binary=PATH',
      required: true,
      help: 'PATH to the firefox binary to use',
    },
  })
  .callback(function(options) {
    var testPrefixToPathMap = {
      'rdutests/': '../../clients/test',
    };
    var runOptions = {
      testMode: 'testui',
      // UI traffic can add up, especially if there are multiple UI clients...
      defaultStepDuration: 3 * 1000,
      maxTestDurationMS: 90 * 1000,
      maxTotalDurationMS: 180 * 1000,
      relayArgs: ['--zipped-profile=' + options.zippedProfile,
                  '--firefox-binary=' + options.firefoxBinary],
      exposeToTest: {
        zippedProfile: options.zippedProfile,
        firefoxBinary: options.firefoxBinary,
      },
    };
    commonTestRun(testPrefixToPathMap, runOptions, options);
  });

// We need to do our own argv slicing to compensate for RequireJS' r.js
parser.parseArgs(process.argv.slice(3));

}); // end require
