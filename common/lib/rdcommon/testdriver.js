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
 *
 **/

define(
  [
    'util', 'fs', 'child_process', 'timers',
    'q',
    './testcontext',
    './extransform',
    'require',
    'exports'
  ],
  function(
    $util, $fs, $subproc, $timers,
    $Q,
    $testcontext,
    $extransform,
    require,
    exports
  ) {
var when = $Q.when;

/**
 * The runtime context interacts with the log fab subsystem to indicate that we
 *  are in a testing mode and to associate actors with loggers.
 */
function TestRuntimeContext() {
  this._loggerStack = [];
  this._pendingActorsByLoggerType = {};

  /**
   * Strictly increasing value for use in tests that want a relative time
   *  ordering for comparison purposes.  Intentionally separate from the logging
   *  subsystem's global sequence identifier because they have different
   *  purposes and scopes.
   */
  this.testDomainSeq = 0;

  this._liveActors = null;
}
TestRuntimeContext.prototype = {
  toString: function() {
    return '[TestRuntimeContext]';
  },
  toJSON: function() {
    return {type: 'TestRuntimeContext'};
  },

  /**
   * Push a logger onto the logger stack; the top of the stack becomes the
   *  parent logger for loggers that do not have an explicit parent logger at
   *  creation time.
   */
  pushLogger: function(logger) {
    this._loggerStack.push(logger);
  },

  /**
   * Remove a specific logger from the logger stack.  While the caller should
   *  be confident they are at the top of the stack, it's not required for
   *  data-structure correctness.  (We should possibly be asserting in that
   *  case...)
   */
  popLogger: function(logger) {
    var idx = this._loggerStack.lastIndexOf(logger);
    if (idx !== -1)
      this._loggerStack.splice(idx, 1);
  },

  /**
   * Used by actors preparing for a test step to register themselves for
   *  association with a logger of the matching type.
   */
  reportPendingActor: function(actor) {
    var type = actor.__defName;
    if (!this._pendingActorsByLoggerType.hasOwnProperty(type))
      this._pendingActorsByLoggerType[type] = [actor];
    else
      this._pendingActorsByLoggerType[type].push(actor);
  },

  /**
   * Logfabs that are told about this context invoke this method when creating a
   *  new logger so that we can hook up actors and insert containing parents.
   *
   * @args[
   *   @param[logger Logger]
   *   @param[curParentLogger @oneof[null Logger]]{
   *     The explicit parent of this logger, if one was provided to the logfab.
   *   }
   * ]
   * @return[@oneof[null Logger]]{
   *   The parent to use for this logger.  This will replace whatever value
   *   was passed in via `curParentLogger`, so `curParentLogger` should be
   *   returned in the intent is not to override the value.
   * }
   */
  reportNewLogger: function(logger, curParentLogger) {
    // - associate with any pending actors
    var type = logger.__defName;
    if (this._pendingActorsByLoggerType.hasOwnProperty(type) &&
        this._pendingActorsByLoggerType[type].length) {
      var actor = this._pendingActorsByLoggerType[type].shift();
      actor.__attachToLogger(logger);
      // There is no need to generate a fake __loggerFired notification because
      //  the logger is brand new and cannot have any entries at this point.
    }

    // - if there is no explicit parent, use the top of the logger stack
    if (!curParentLogger && this._loggerStack.length)
      return this._loggerStack[this._loggerStack.length - 1];
    return curParentLogger;
  },

  /**
   * Allows actor mix-in methods that contain nested sub-actors to report their
   *  sub-actors as active this step, allowing them to be used for expectations.
   */
  reportActiveActorThisStep: function(actor) {
    if (this._liveActors === null)
      throw new Error("We are not in a step!");
    if (actor._activeForTestStep)
      return;
    this._liveActors.push(actor);
    actor.__prepForTestStep(this);
  },

  peekLogger: function() {
    if (this._loggerStack.length)
      return this._loggerStack[this._loggerStack.length - 1];
    return null;
  },
};

var STEP_TIMEOUT_MS = 1000;

/**
 * Consolidates the logic to run tests.
 */
function TestDefinerRunner(testDefiner, superDebug) {
  if (!testDefiner)
    throw new Error("No test definer provided!");
  this._testDefiner = testDefiner;
  this._runtimeContext = new TestRuntimeContext();
  this._superDebug = Boolean(superDebug);

  this._logBadThingsToLogger = null;
}
TestDefinerRunner.prototype = {
  toString: function() {
    return '[TestDefinerRunner]';
  },
  toJSON: function() {
    return {type: 'TestDefinerRunner'};
  },

  /**
   * Asynchronously run a test step, non-rejecting promise-style.
   *
   * @return[Boolean]{
   *   A boolean indicator of whether the step passed.
   * }
   */
  runTestStep: function(step) {
    const superDebug = this._superDebug;
    if (superDebug)
      console.log("\n====== Running Step: " + step.log._ident);
    var iActor, actor;

    this._logBadThingsToLogger = step.log;

    var liveActors = this._runtimeContext._liveActors = step.actors.concat();

    // -- notify the actors about their imminent use in a step
    // (intentionally step.actors rather that liveActors)
    for (iActor = 0; iActor < step.actors.length; iActor++) {
      actor = step.actors[iActor];
      actor.__prepForTestStep(this._runtimeContext);
    }

    // -- initiate the test function
    step.log.run_begin();
    // (this wraps and handles failures!)
    var rval = step.log.stepFunc(null, step.testFunc);
    // any kind of exception in the function is a failure.
    if (rval instanceof Error) {
      if (superDebug)
        console.log(" encountered an error in the step func:", rval);
      step.log.run_end();
      step.log.result('fail');
      return false;
    }

    // -- wait on actors' expectations (if any) promise-style
    if (superDebug)
      console.log(" there are", liveActors.length, "live actors this step",
                  "up from", step.actors.length, "step-defined actors");
    var promises = [], allGood = true;
    for (iActor = 0; iActor < liveActors.length; iActor++) {
      actor = liveActors[iActor];
      var waitVal = actor.__waitForExpectations();
      if ($Q.isPromise(waitVal)) {
        promises.push(waitVal);
        if (superDebug)
          console.log(" actor", actor.__defName, actor.__name,
                      "generated a promise");
      }
      // if it's not a promise, it must be a boolean
      else if (!waitVal) {
        allGood = false;
      }
    }

    if (!promises.length) {
      step.log.run_end();
      step.log.result(allGood ? 'pass' : 'fail');

      // clear out all the actors, however!
      for (iActor = 0; iActor < liveActors.length; iActor++) {
        actor = liveActors[iActor];
        actor.__resetExpectations();
      }
      this._runtimeContext._liveActors = null;

      return allGood;
    }
    else {
      // create a deferred so we can generate a timeout.
      var deferred = $Q.defer(), self = this;
      // -- timeout handler
      var countdownTimer = $timers.setTimeout(function() {
        if (!deferred) return;
        // - tell the actors to fail any remaining expectations
        for (var iActor = 0; iActor < liveActors.length; iActor++) {
          actor = liveActors[iActor];
          if (!actor._logger)
            step.log.actorNeverGotLogger(actor.__defName, actor.__name);
          else
            actor.__failUnmetExpectations();
          actor.__resetExpectations();
        }
        self._runtimeContext._liveActors = null;

        step.log.timeout();
        step.log.result('fail');
        deferred.resolve(false);
        deferred = null;
      }, STEP_TIMEOUT_MS);
      // -- promise resolution/rejection handler
      if (this._superDebug)
        console.log("waiting on", promises.length, "promises");
      when($Q.all(promises), function passed() {
        if (!deferred) return;
        clearTimeout(countdownTimer);

        // We should have passed, but it's possible that some logger generated
        //  events after the list of expectations.  It was too late for it to
        //  generate a rejection at that point, so we need to check now.
        var passed = true;
        // - tell the actors we are done with this round
        for (var iActor = 0; iActor < liveActors.length; iActor++) {
          actor = liveActors[iActor];
          // detect if we ended up with a weird error.
          if (!actor.__resetExpectations())
            passed = false;
        }
        self._runtimeContext._liveActors = null;

        step.log.run_end();
        step.log.result(passed ? 'pass' : 'fail');
        deferred.resolve(allGood);
        deferred = null;
      }, function failed(expPair) {
        if (!deferred) return;
        // XXX we should do something with the failed expectation pair...
        clearTimeout(countdownTimer);

        // - tell the actors we are done with this round
        for (var iActor = 0; iActor < liveActors.length; iActor++) {
          actor = liveActors[iActor];
          // let's generate failures so it's clear what might might have yet
          //  to fail because of some other built-in failures.  This should
          //  help make all our expectations more explicit.  This is
          //  particularly helpful in the unordered case where mismatches are
          //  now reported as unexpected events instead of mismatches (because
          //  we have no edit distance type algorithm to tell which in a set
          //  was closest/close at all, etc.).
          actor.__failUnmetExpectations();
          actor.__resetExpectations();
        }
        self._runtimeContext._liveActors = null;

        step.log.run_end();
        step.log.result('fail');
        deferred.resolve(false);
        deferred = null;
      });
      return deferred.promise;
    }
  },

  /**
   * Synchronously skip a test step, generating appropriate logging/reporting
   *  byproducts so it's clear the step was skipped rather than disappearing
   *  from the radar.
   */
  skipTestStep: function(step) {
    step.log.result('skip');
    return true;
  },

  /**
   * Run a specific permutation of a test-case.  The zeroth case of a
   *  permutation is special as it is also when the number of permutations is
   *  actually determined.
   * XXX we don't actually do anything with permutations right now.
   *
   * @return[Boolean]{
   *   A boolean indicator of whether the test passed.
   * }
   */
  runTestCasePermutation: function(testCase, permutationNum) {
    // Generate a fresh deferred that uses internal counting rather than chained
    //  promises for resolution.
    var deferred = $Q.defer(), self = this;

    // -- create / setup the context
    testCase.log.run_begin();
    var defContext = new $testcontext.TestContext(testCase, 0);
    defContext._log.run_begin();

    // - push the context's logger on the runtime logging stack
    // (We want all new logged objects to be associated with the context since
    //  it should bound their lifetimes.  Although it is interesting to know
    //  what specific step a logger came-to-life, we expect that to occur via
    //  cross-referencing.  If we anchored loggers in their creating step then
    //  the hierarchy would be extremely confusing.)
    self._runtimeContext.pushLogger(defContext._log);

    // - execute the test-case definition function with the context
    var rval = defContext._log.setupFunc({}, testCase.setupFunc, defContext);
    if (rval instanceof Error) {
      // in the event we threw during the case setup phase, it's a failure.
      defContext._log.result('fail');
      testCase.log.result('fail');
      return false;
    }
    defContext.__postSetupFunc();

    // -- process the steps
    // In event of a setup/action failure, change to only running cleanup steps.
    var allPassed = true, iStep = 0;
    function runNextStep(passed) {
      if (!passed)
        allPassed = false;
      // -- done case
      if (iStep >= defContext.__steps.length) {
        // - pop the test-case logger from the logging context stack
        self._runtimeContext.popLogger(defContext._log);

        // - resolve!
        defContext._log.result(allPassed ? 'pass' : 'fail');
        defContext._log.run_end();
        testCase.log.result(allPassed ? 'pass' : 'fail');
        testCase.log.run_end();
        deferred.resolve(allPassed);
        return;
      }

      // -- yet another step case
      var step = defContext.__steps[iStep++];
      var runIt = allPassed || (step.kind === 'cleanup');
      if (runIt)
        when(self.runTestStep(step), runNextStep);
      else // for stack simplicity, run the skip in a when, but not required.
        when(self.skipTestStep(step), runNextStep);
    }
    runNextStep(true);

    return deferred.promise;
  },

  runTestCase: function(testCase) {
    return this.runTestCasePermutation(testCase, 0);
  },

  _markDefinerUnderTest: function(definer) {
    definer._runtimeContext = this._runtimeContext;
    for (var iFab = 0; iFab < definer.__logfabs.length; iFab++) {
      definer.__logfabs[iFab]._underTest = this._runtimeContext;
    }
  },

  _clearDefinerUnderTest: function(definer) {
    definer._runtimeContext = null;
    for (var iFab = 0; iFab < definer.__logfabs.length; iFab++) {
      definer.__logfabs[iFab]._underTest = null;
    }
  },

  runAll: function(errorTrapper) {
//console.error(" runAll()");
    var deferred = $Q.defer(), iTestCase = 0, definer = this._testDefiner,
        self = this;
    this._markDefinerUnderTest(definer);
    definer._log.run_begin();
    // -- next case
    function runNextTestCase() {
//console.error("  runNextTestCase()");
      // - all done
      if (iTestCase >= definer.__testCases.length) {
        errorTrapper.removeListener('exit', earlyBailHandler);
        errorTrapper.removeListener('uncaughtException',
                                    uncaughtExceptionHandler);

        definer._log.run_end();
        self._clearDefinerUnderTest(definer);
//console.error("   resolving!");
        deferred.resolve(self);
        return;
      }
      var testCase = definer.__testCases[iTestCase++];
      when(self.runTestCase(testCase), runNextTestCase);
    }

    // node.js will automatically terminate when the event loop says there is
    //  nothing left to do.  We register a listener to detect this and promote
    //  it to a last-ditch failure case.  Note that this is not a recoverable
    //  state; there will be no more event loop ticks in an auto-termination
    //  and so we can't depend on promises, etc.  Buffers will be flushed,
    //  however.
    function earlyBailHandler() {
      console.error("IMMINENT EVENT LOOP TERMINATION IMPLYING BAD TEST, " +
                    "DUMPING LOG.");
      self.dumpLogResultsToConsole(errorTrapper.reliableOutput);
    }
    errorTrapper.once('exit', earlyBailHandler);

    /**
     * Log uncaught exceptions to the currently active test step.
     */
    function uncaughtExceptionHandler(ex) {
      if (self._logBadThingsToLogger)
        self._logBadThingsToLogger.uncaughtException(ex);
    }
    errorTrapper.on('uncaughtException', uncaughtExceptionHandler);

    runNextTestCase();
    return deferred.promise;
  },

  /**
   * We use console.error because stderr is never buffered while stdout is.  In
   *  the event of event loop shutdown due to lack of events stdout reliably
   *  (in the node 0.4.8 time-frame) fails to output our data before dying.
   *  As a result, it's really important to make sure stderr gets into the
   *  output file too.  I suggest using &> for redirection.
   */
  dumpLogResultsToConsole: function(reliableOutput) {
    var definer = this._testDefiner;
    // - accumulate the schemas of all the (potentially) involved schema dudes.
    var schema = {}, key, rawDef;
    // populate the schema with the test logger schemas
    rawDef = $testcontext.LOGFAB._rawDefs;
    for (key in rawDef) {
      schema[key] = rawDef[key];
    }
    rawDef = $testcontext.__LAZYLOGFAB._rawDefs;
    for (key in rawDef) {
      schema[key] = rawDef[key];
    }

    // and now add in the schemas used by the test
    for (var iFab = 0; iFab < definer.__logfabs.length; iFab++) {
      rawDef = definer.__logfabs[iFab]._rawDefs;
      for (key in rawDef) {
        schema[key] = rawDef[key];
      }
    }

    // - dump
    reliableOutput("##### LOGGEST-TEST-RUN-BEGIN #####");
    try {
      var dumpObj = {
        schema: schema,
        log: definer._log,
      };
      reliableOutput(JSON.stringify(dumpObj));
    }
    catch (ex) {
      console.error("JSON problem:", ex.message, ex.stack, ex);
      try {
        detectAndReportJsonCycles(definer._log);
        //console.error($util.inspect(dumpObj, false, 8 /* 12 */));
      }
      catch(exx) {
        console.error("exx y", exx);
      }
    }
    reliableOutput("##### LOGGEST-TEST-RUN-END #####");
    //console.error("AND FOR THE HUMANS...");
    //console.error(JSON.stringify(dumpObj, false, 2));
  }
};


function detectAndReportJsonCycles(obj) {

  var objStack = [];
  var traverseStack = [];
  function recurse(what) {
    if (what == null || typeof(what) !== 'object')
      return;

    // - cycle?
    if (objStack.indexOf(what) !== -1) {
      console.error("CYCLE with traversal", traverseStack);
      return;
    }
    objStack.push(what);
    traverseStack.push(".");
    var level = traverseStack.length - 1;

    var use;
    if ("toJSON" in what)
      use = what.toJSON();
    else
      use = what;

    for (var key in use) {
      // JSON traversal is shallow; nb: we could use ES5 instead of this hack
      if (!use.hasOwnProperty(key))
        continue;
      var val = use[key];
      traverseStack[level] = key;
      recurse(val);
    }

    objStack.pop();
    traverseStack.pop();
  }
  recurse(obj);
}

/**
 * In the event require()ing a test module fails, we want to report this
 *  so it's not just like the test disappears from the radar.
 */
function reportTestModuleRequireFailures(testModuleName, moduleName,
                                         exceptions) {
  console.error("##### LOGGEST-TEST-RUN-BEGIN #####");
  try {
    var dumpObj = {
      schema: $testcontext.LOGFAB._rawDefs,
      fileFailure: {
        fileName: testModuleName,
        moduleName: moduleName,
        exceptions: exceptions.map($extransform.transformException),
      }
    };
    console.error(JSON.stringify(dumpObj));
  }
  catch (ex) {
    console.error("JSON problem:", ex.message, ex.stack, ex);
    console.error($util.inspect(dumpObj, false, 12));
  }
  console.error("##### LOGGEST-TEST-RUN-END #####");
}

/**
 * Run the tests defined in a single module that we require (so that we can
 *  handle errors in the require() process).
 *
 * @return[success Boolean]
 */
exports.runTestsFromModule = function runTestsFromModule(testModuleName,
                                                         ErrorTrapper,
                                                         superDebug) {
  var deferred = $Q.defer();
  var runner;
  function itAllGood() {
//console.error("  itAllGood()");
    runner.dumpLogResultsToConsole(ErrorTrapper.reliableOutput);
    deferred.resolve(true);
  };

  // nutshell:
  // * r.js previously would still invoke our require callback function in
  //    the event of a failure because our error handler did not actually
  //    throw, but just ate the error.  So we would generate errors at that
  //    point.
  // * now r.js no longer issues the callback because it performs a return when
  //    invoking the callback, so we generate the error when the error happens.
  //    This does mean that if there are multiple errors, we will only see one
  //    of them before giving up, but many times the subsequent errors were
  //    just fall-out from modules' evaluating to null.
  var alreadyBailed = false;
  ErrorTrapper.callbackOnError(function explodey(err, moduleName) {
//console.error("ERROR TRAPPAH");
    if (alreadyBailed)
      return;
    reportTestModuleRequireFailures(testModuleName, moduleName, [err]);
    deferred.resolve(true);
    alreadyBailed = true;
//console.error("ERROR TRAPPAH2");
  });
  require([testModuleName], function(tmod) {
//console.error("IN TEST MODULE INVOC");
    // XXX per the above, this bit is moot now and should be removed unless
    //  r.js changes behaviour (from our perspective) again.
    // If there was a problem, tmod will be null (and we will have trapped
    //  an error.)
    var trappedErrors = ErrorTrapper.gobbleAndStopTrappingErrors();
    if (alreadyBailed)
      return;
    if (trappedErrors.length) {
      reportTestModuleRequireFailures(testModuleName, trappedErrors);
      deferred.resolve(true);
      return;
    }
    if (!tmod.TD) {
      var fakeError = new Error("Test module: '" + testModuleName +
                                 "' does not export a 'TD' symbol!");
      reportTestModuleRequireFailures(testModuleName, [fakeError]);
      deferred.resolve(true);
      return;
    }

    // now that it is loaded, run it
    runner = new TestDefinerRunner(tmod.TD, superDebug);
    when(runner.runAll(ErrorTrapper), itAllGood, itAllGood);
  });
  return deferred.promise;
};

/**
 * Run the given test in a subprocess by invoking our command-line handler
 *  again but giving it a specific test, thereby avoiding system destroying
 *  fork-bombs.
 *
 * This function is intended to support having multiple concurrent test runs
 *  happening through multiple concurrent runs of this function.  As such
 *  we do buffer the output of the sub-tests so there is no chance for
 *  interleaving.
 */
function runTestInSubProcess(testModuleName) {
  console.error(":: running", testModuleName, "in subprocess");
  var deferred = $Q.defer();

  // we are assuming/requiring the same working path of servers/lib
  var args = [process.execPath, 'r.js', 'rdservers/cmdline.js',
              'test', testModuleName];
  var cmd = args.join(' ');
  var opts = {
    // deathClock + 5sec.
    timeout: 1000 * 25,
    // logs should ideally be much smaller, but they deserve their space
    maxBuffer: 10 * 1024 * 1024,
  };
  console.error("    ", cmd);
  $subproc.exec(cmd, opts, function(error, stdout, stderr) {
    console.error("  :: stdout");
    console.error(stdout);
    console.error("  :: stderr");
    console.error(stderr);
    console.error("  :: finished", Boolean(error), "\n\n");
    deferred.resolve();
  });

  return deferred.promise;
}

/**
 * Runs multiple test files given their module names; we require and run each
 *  test in succession.  In the future, this may operate by forking a new node
 *  runtime, but for now, everything runs in the same process.
 */
function MultiTestFileRunner(moduleNames, errorTrapper) {
  this._moduleNames = moduleNames;
  this._iNextModule = 0;
  this._errorTrapper = errorTrapper;
}
MultiTestFileRunner.prototype = {
  runAll: function() {
    var self = this;
    var deferred = $Q.defer();

    function runNextFile() {
      // finish if there's no more work to do
      if (self._iNextModule >= self._moduleNames.length) {
        deferred.resolve();
        return;
      }

      // require the module to test
      var testModuleName = self._moduleNames[self._iNextModule++];

      // - have a subprocess run the file
      when(runTestInSubProcess(testModuleName), runNextFile);
    }

    runNextFile();

    return deferred.promise;
  },

};

const RE_TEST = /^(.+)\.js$/;

/**
 * Synchronously scan a list of directories for test files, and feed them to
 *  the TestDefinerRunner which will then (require and) execute them asynchronously.
 *
 * XXX this should ideally be migrated to a cross-platform API like jstut's
 *  unifile abstraction or something more universally adopted.
 */
exports.runTestsFromDirectories = function(namespacePathMap, errorTrapper) {
  var testModules = [];
  for (var namespacePrefix in namespacePathMap) {
    var path = namespacePathMap[namespacePrefix];
    var names = $fs.readdirSync(path);
    for (var iName = 0; iName < names.length; iName++) {
      var name = names[iName];

      var match = RE_TEST.exec(name);
      if (match)
        testModules.push(namespacePrefix + match[1]);
    }
  }

  var multiRunner = new MultiTestFileRunner(testModules, errorTrapper);
  return multiRunner.runAll();
};

}); // end define
