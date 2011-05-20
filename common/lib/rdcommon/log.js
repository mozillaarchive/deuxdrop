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
 * Raindrop-specific testing/logging setup; right now holds initial 'loggest'
 *  implementation details that should get refactored out into their own
 *  thing.
 *
 * There is a need for raindrop-specific logging logic because names tend to
 *  be application specific things as well as the determination of what is
 *  interesting.
 *
 * @typedef[HierLogFrag @dict[
 *   @key[loggerIdent String]{
 *
 *   }
 *   @key[semanticIdent String]{
 *   }
 *   @key[uniqueName String]{
 *     A unique identifier not previously used in the effective namespace
 *     of the root HierLogFrag for this tree and all its descendents.
 *   }
 *   @key[born #:optional TimestampMS]{
 *     Timestamp of when this logger was instantiated.
 *   }
 *   @key[died #:optional TimestampMS]{
 *     Timestamp of when this logger was marked dead.
 *   }
 *   @key[entries @listof[LogEntry]]{
 *     The log entries for this logger this time-slice.
 *   }
 *   @key[kids #:optional @listof[HierLogFrag]]{
 *     Log fragments of loggers deemed to be conceptually children of the logger
 *     that produced this logger.  For example, an HTTP server would have a
 *     logger and its connection workers would be loggers that are children of
 *     the server.
 *   }
 * ]]{
 *   Loggers are organized into hierarchies
 * }
 * @typedef[HierLogTimeSlice @dict[
 *   @key[begin TimestampMS]
 *   @key[end TimestampMS]
 *   @key[logFrag HierLogFrag]
 * ]]{
 *
 * }
 **/

define(
  [
    'q',
    'exports'
  ],
  function(
    $Q,
    exports
  ) {

/**
 * Dummy logger prototype; instances gather statistics but do not generate
 *  detailed log events.
 */
var DummyLogProtoBase = {
  _kids: undefined,
};

/**
 * Full logger prototype; instances accumulate log details but are intended by
 *  policy to not long anything considered user-private.  This differs from
 *  `TestLogProtoBase` which, in the name of debugging and system understanding
 *  can capture private data but which should accordingly be test data.
 */
var LogProtoBase = {
  toJSON: function() {
    return {
      loggerIdent: this.__defName,
      semanticIdent: this._ident,
      born: this._born,
      events: this._eventMap,
      entries: this._entries,
      kids: this._kids
    };
  },
};

/**
 * Test (full) logger prototype; instances generate notifications for actor
 *  expectation checking on all calls and observe arguments that may contain
 *  user-private data (but which should only contain definitively non-private
 *  test data.)
 *
 * For simplicity of implementation, this class currently just takes the
 *  functions implemented by LogProtoBase and wraps them with a parameterized
 *  decorator.
 */
var TestLogProtoBase = {
  __proto__: LogProtoBase,
};

var TestActorProtoBase = {
  /**
   * Prepare for activity in a test step.  If we do not already have a paired
   *  logger, this will push us onto the tracking list so we will be paired when
   *  the logger is created.
   */
  __prepForTestStep: function(testRuntimeContext) {
    if (!this._logger)
      testRuntimeContext.reportPendingActor(this);
  },

  /**
   * Issue a promise that will be resolved when all expectations of this actor
   *  have been resolved.  If no expectations have been issued, just return
   *  null.
   */
  __waitForExpectations: function() {
    if (this._iExpectation >= this._expectations.length)
      return this._expectationsMet;

    if (!this._deferred)
      this._deferred = $Q.defer();
    return this._deferred.promise;
  },

  __resetExpectations: function() {
    this._expectationsMet = true;
    this._iEntry = this._iExpectation = 0;
    this._expectations.splice(0, this._expectations.length);
    this._deferred = null;
  },

  /**
   * Invoked by the test-logger associated with this actor to let us know that
   *  something has been logged so that we can perform an expectation check and
   *  fulfill our promise/reject our promise, as appropriate.
   */
  __loggerFired: function() {
    // we can't do anything if we don't have an actor.
    while (this._iExpectation < this._expectations.length &&
           this._iEntry < this._entries.length) {
      var expy = this._expectations[this._iExpectation++];
      var entry = this._entries[this._iEntry++];
      // Currently, require exact pairwise matching between entries and
      //  expectations.
      if (expy[0] !== entry[0] ||
          !this['_verify_' + expy[0]](expy, entry)) {
        this._expectationsMet = false;
        if (this._deferred)
          this._deferred.reject([expy, entry]);
        return;
      }
    }
    // XXX explode on logs without expectations?

    if ((this._iExpectation >= this._expectations.length) && this._deferred)
      this._deferred.resolve();
  },
};
exports.TestActorProtoBase = TestActorProtoBase;

function NOP() {
}

/**
 * Builds the logging and testing helper classes for the `register` driver.
 *
 * It operates in a similar fashion to wmsy's ProtoFab mechanism; state is
 *  provided to helpers by lexically closed over functions.  No code generation
 *  is used, but it's intended to be an option.
 */
function LoggestClassMaker(moduleFab, name) {
  this.moduleFab = moduleFab;
  this.name = name;

  // steady-state minimal logging logger (we always want statistics!)
  this.dummyProto = {
    __proto__: DummyLogProtoBase,
    __defName: name,
  };
  // full-logging logger
  this.logProto = {
    __proto__: LogProtoBase,
    __defName: name,
  };
  // testing full-logging logger
  this.testLogProto = {
    __proto__: TestLogProtoBase,
    __defName: name,
  };
  // testing actor for expectations, etc.
  this.testActorProto = {
    __proto__: TestActorProtoBase,
    __defName: name,
  };

  /** Maps helper names to their type for collision reporting by `_define`. */
  this._definedAs = {};
}
LoggestClassMaker.prototype = {
  /**
   * Name collision detection helper; to be invoked prior to defining a name
   *  with the type of name being defined so we can tell you both types that
   *  are colliding.
   */
  _define: function(name, type) {
    if (this._definedAs.hasOwnProperty(name)) {
      throw new Error("Attempt to define '" + name + "' as a " + type +
                      " when it is already defined as a " +
                      this._definedAs[name] + "!");
    }
    this._definedAs[name] = type;
  },

  /**
   * Wrap a logProto method to be a testLogProto invocation that generates a
   *  constraint checking thing.
   */
  _wrapLogProtoForTest: function(name) {
    var logFunc = this.logProto[name];
    this.testLogProto[name] = function() {
      logFunc.apply(this, arguments);
      var testActor = this._actor;
      if (testActor)
        testActor.__loggerFired();
    };
  },

  addStateVar: function(name) {
    this._define(name, 'state');

    this.dummyProto[name] = NOP;

    this.logProto[name] = function(val) {
      this._entries.push([name, val, Date.now()]);
    };

    this._wrapLogProtoForTest(name);

    this.testActorProto['expect_' + name] = function(val) {
      this._expectations.push([name, val]);
    };
    this.testActorProto['_verify_' + name] = function(exp, entry) {
      return exp[1] === entry[1];
    };
  },
  /**
   * Dubious mechanism to allow logger objects to be used like a task
   *  construct that can track success/failure or some other terminal state.
   *  Contrast with state-vars which are intended to track an internal state
   *  for analysis but not to serve as a summarization of the application
   *  object's life.
   * This is being brought into being for the unit testing framework so that
   *  we can just use the logger hierarchy as the actual result hierarchy.
   *  This may be a horrible idea.
   *
   * This currently does not generate or support the expectation subsystem
   *  since the only use right now is the testing subsystem.
   */
  addLatchedState: function(name) {
    this._define(name, 'latchedState');
    this.hasLatchedState = true;

    this.testLogProto[name] = this.logProto[name] = this.dummyProto[name] =
        function(val) {
      this[name] = val;
    };
  },
  addEvent: function(name, args) {
    this._define(name, 'event');

    var numArgs = 0;
    for (var key in args) {
      numArgs++;
    }

    this.dummyProto[name] = function() {
      this._eventMap[name] = (this._eventMap[name] || 0) + 1;
    };

    this.logProto[name] = function() {
      this._eventMap[name] = (this._eventMap[name] || 0) + 1;
      var entry = [name];
      for (var iArg = 0; iArg < numArgs; iArg++) {
        entry.push(arguments[iArg]);
      }
      entry.push(Date.now());
      this._entries.push(entry);
    };

    this.testActorProto['expect_' + name] = function() {
      var exp = [name];
      for (var iArg = 0; iArg < numArgs; iArg++) {
        exp.push(arguments[iArg]);
      }
      this._expectations.push(exp);
    };
    this.testActorProto['_verify_' + name] = function(tupe, entry) {
      // only check arguments we had expectations for.
      for (var iArg = 1; iArg < tupe.length; iArg++) {
        if (tupe[iArg] !== entry[iArg])
          return false;
      }
      return true;
    };
  },
  addAsyncJob: function(name, args) {
    var name_begin = name + '_begin', name_end = name + '_end';
    this.dummyProto[name_begin] = NOP;
    this.dummyProto[name_end] = NOP;

    var numArgs = 0;
    for (var key in args) {
      numArgs++;
    }

    this.logProto[name_begin] = function() {
      this._eventMap[name_begin] = (this._eventMap[name_begin] || 0) + 1;
      var entry = [name_begin];
      for (var iArg = 0; iArg < numArgs; iArg++) {
        entry.push(arguments[iArg]);
      }
      entry.push(Date.now());
      this._entries.push(entry);
    };
    this.logProto[name_end] = function() {
      this._eventMap[name_end] = (this._eventMap[name_end] || 0) + 1;
      var entry = [name_end];
      for (var iArg = 0; iArg < numArgs; iArg++) {
        entry.push(arguments[iArg]);
      }
      entry.push(Date.now());
      this._entries.push(entry);
    };

    this._wrapLogProtoForTest(name_begin);
    this._wrapLogProtoForTest(name_end);

    this.testActorProto['expect_' + name_begin] = function() {
      var exp = [name_begin];
      for (var iArg = 0; iArg < numArgs; iArg++) {
        exp.push(arguments[iArg]);
      }
      this._expectations.push(exp);
    };
    this.testActorProto['expect_' + name_end] = function() {
      var exp = [name_end];
      for (var iArg = 0; iArg < numArgs; iArg++) {
        exp.push(arguments[iArg]);
      }
      this._expectations.push(exp);
    };
    this.testActorProto['_verify_' + name_begin] =
        this.testActorProto['_verify_' + name_end] = function(tupe, entry) {
      // only check arguments we had expectations for.
      for (var iArg = 1; iArg < tupe.length; iArg++) {
        if (tupe[iArg] !== entry[iArg])
          return false;
      }
      return true;
    };
  },
  addCall: function(name, logArgs) {
    this._define(name, 'call');

    var numLogArgs = 0;
    for (var key in logArgs) {
      numLogArgs++;
    }

    this.dummyProto[name] = function() {
      var rval;
      try {
        rval = arguments[numLogArgs+1].apply(
          arguments[numLogArgs], Array.prototype.slice.call(arguments, iArg+2));
      }
      catch(ex) {
        // (call errors are events)
        this._eventMap[name] = (this._eventMap[name] || 0) + 1;
        rval = ex;
      }
      return rval;
    };

    this.logProto[name] = function() {
      var rval, iArg;
      var entry = [name];
      for (iArg = 0; iArg < numLogArgs; iArg++) {
        entry.push(arguments[iArg]);
      }
      entry.push(Date.now());
      try {
        rval = arguments[numLogArgs+1].apply(
          arguments[numLogArgs], Array.prototype.slice.call(arguments, iArg+2));
        entry.push(Date.now());
        this._entries.push(entry);
      }
      catch(ex) {
        entry.push(Date.now());
        entry.push(ex);
        this._entries.push(entry);
        // (call errors are events)
        this._eventMap[name] = (this._eventMap[name] || 0) + 1;
        rval = ex;
      }

      return rval;
    };

    this.testActorProto['expect_' + name] = function() {
      var exp = [name];
      for (var iArg = 0; iArg < arguments.length; iArg++) {
        exp.push(arguments[iArg]);
      }
      this._expectations.push(exp);
    };
  },
  addError: function(name, args) {
    this._define(name, 'error');

    this.dummyProto[name] = function() {
      this._eventMap[name] = (this._eventMap[name] || 0) + 1;
    };

    this.logProto[name] = function() {
      this._eventMap[name] = (this._eventMap[name] || 0) + 1;
      var entry = [name];
      for (var iArg = 0; iArg < numArgs; iArg++) {
        entry.push(arguments[iArg]);
      }
      entry.push(Date.now());
      this._entries.push(entry);
    };

    this.testActorProto['expect_' + name] = function() {
      var exp = [name];
      for (var iArg = 0; iArg < numArgs; iArg++) {
        exp.push(arguments[iArg]);
      }
      this._expectations.push(exp);
    };
  },

  makeFabs: function() {
    var moduleFab = this.moduleFab;

    var dummyCon = function dummyConstructor() {
      this._eventMap = {};
    };
    dummyCon.prototype = this.dummyProto;

    var loggerCon = function loggerConstructor(ident) {
      this._ident = ident;
      this._eventMap = {};
      this._entries = [];
      this._born = Date.now();
      this._kids = null;
    };
    loggerCon.prototype = this.logProto;

    var testerCon = function testerLoggerConstructor(ident) {
      this._ident = ident;
      this._eventMap = {};
      this._entries = [];
      this._born = Date.now();
      this._kids = null;
      this._actor = null;
      this._expectations = [];
      this._expectationsMet = true;
      this._iEntry = this._iExpectation = 0;
    };
    testerCon.prototype = this.testActorProto;

    var testActorCon = function testActorConstructor(name) {
      this.__name = name;
      // initially undefined, goes null when we register for pairing, goes to
      //  the logger instance when paired.
      this._logger = undefined;
    };
    testActorCon.prototype = this.testActorProto;
    this.moduleFab._actorCons[this.name] = testActorCon;

    /**
     * Determine what type of logger to create, whether to tell other things
     *  in the system about it, etc.
     */
    var loggerDecisionFab = function loggerDecisionFab(parentLogger, ident) {
      var logger, tester;
      // - Testing
      if ((tester = (moduleFab._underTest || loggerDecisionFab._underTest))) {
        logger = new testerCon(ident);
        parentLogger = tester.reportNewLogger(logger, parentLogger);
      }
      // - Logging
      else if (moduleFab._generalLog || testerCon._generalLog) {
        logger = new loggerCon(ident);
      }
      // - Statistics Only
      else {
        return new dummyCon();
      }

      if (parentLogger) {
        if (parentLogger._kids === undefined) {
        }
        else if (parentLogger._kids === null) {
          parentLogger._kids = [logger];
        }
        else {
          parentLogger._kids.push(logger);
        }
      }
      return logger;
    };
    this.moduleFab[this.name] = loggerDecisionFab;
  },
};

var LEGAL_FABDEF_KEYS = [
  'implClass', 'type', 'subtype',
  'stateVars', 'latchState', 'events', 'asyncJobs', 'calls', 'errors',
];

exports.register = function register(mod, defs) {
  var fab = {_generalLog: true, _underTest: false, _actorCons: {}};
  var testActors = fab._testActors;

  for (var defName in defs) {
    var key, loggerDef = defs[defName];

    for (key in loggerDef) {
      if (LEGAL_FABDEF_KEYS.indexOf(key) === -1) {
        throw new Error("key '" + key + "' is not a legal log def key");
      }
    }

    var maker = new LoggestClassMaker(fab, defName);

    if ("stateVars" in loggerDef) {
      for (key in loggerDef.stateVars) {
        maker.addStateVar(key);
      }
    }
    if ("latchState" in loggerDef) {
      for (key in loggerDef.latchState) {
        maker.addLatchedState(key);
      }
    }
    if ("events" in loggerDef) {
      for (key in loggerDef.events) {
        maker.addEvent(key, loggerDef.events[key]);
      }
    }
    if ("asyncJobs" in loggerDef) {
      for (key in loggerDef.asyncJobs) {
        maker.addAsyncJob(key, loggerDef.asyncJobs[key]);
      }
    }
    if ("calls" in loggerDef) {
      for (key in loggerDef.calls) {
        maker.addCall(key, loggerDef.calls[key]);
      }
    }
    if ("errors" in loggerDef) {
      for (key in loggerDef.errors) {
        maker.addError(key, loggerDef.errors[key]);
      }
    }

    maker.makeFabs();
  }

  return fab;
};

// role information
exports.CONNECTION = 'connection';
exports.SERVER = 'server';
exports.CLIENT = 'client';

exports.TEST_DRIVER = 'testdriver';
exports.TEST_GROUP = 'testgroup';
exports.TEST_CASE = 'testcase';
exports.TEST_PERMUTATION = 'testperm';
exports.TEST_STEP = 'teststep';

}); // end define
