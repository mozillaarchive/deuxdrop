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
 * Raindrop-specific testing setup, friends with log.js; right now holds parts
 *  of the 'loggest' implementation involving only testing (and which should
 *  end up in their own project initially.)
 *
 * All classes in this file are definition-support and data structures only;
 *  they do not directly run the tests themselves, although some data-structures
 *  are only populated as a byproduct of function execution.  Namely,
 *  TestContexts are populated and fed to `TestCase` functions during the
 *  execution phase, producing test step definitions as a byproduct.  The
 *  actual run-logic lives in `testdriver.js`.
 *
 * Note, however, that the classes in this file do hold the loggers associated
 *  with their runtime execution.
 **/

define(
  [
    'q',
    './log',
    'exports'
  ],
  function(
    $Q,
    $log,
    exports
  ) {

/**
 * Data-record class for test steps; no built-in logic.
 */
function TestStep(_log, kind, descBits, actors, testFunc) {
  this.kind = kind;
  this.descBits = descBits;
  this.actors = actors;
  this.testFunc = testFunc;

  this.log = LOGFAB.testStep(this, _log, descBits);
}
TestStep.prototype = {
};

/**
 * TestContexts are used to create actors and define the actions that define
 *  the steps of the test.  Each context corresponds with a specific run of a
 *  test case.  In a test case with only 1 permutation, there will be just one
 *  `TestContext`, but in a case with N permutations, there will be N
 *  `TestContext`s.
 *
 * There is some wastefulness to this approach since all of the steps are
 *  re-defined and the step functions get new closures, etc.  This is done in
 *  the name of safety (no accidental object re-use) and consistency with the
 *  Jasmine idiom.
 */
function TestContext(testCase, permutationIndex) {
  this.__testCase = testCase;
  this._permIdx = permutationIndex;
  this._permutations = 1;
  this.__steps = [];

  this._log = LOGFAB.testCasePermutation(this, testCase.log,
                                         permutationIndex);
  // this is a known-but-null-by-default thing that gets copied to the JSON
  //  blob when present.
  this._log._named = {};

  this._actors = [];
}
TestContext.prototype = {
  /**
   * A testing stand-in for a player in the test that does stuff; for example, a
   *  client or a server.  An actor correlates with and is associated with
   *  exactly one logger.  You use the actor to specify expectations about
   *  what that logger will log for the implementing class that is driving it.
   *  Actors may also expose convenience functions that directly manipulate the
   *  underlying implementation class.  The convenience functions may
   *  automatically generate expectations.
   *
   * Actors are paired with their logger at logger creation time.  You define
   *  the actor to the testing framework using this method AND name it in a test
   *  step in order to get it pushed on the watch-list prior to causing the
   *  associated logger to be created.  Convenience functions can automate this
   *  process but still need to abide by it.
   */
  actor: function actor(type, name) {
    var fabs = this.__testCase.definer.__logfabs;
    for (var iFab = 0; iFab < fabs.length; iFab++) {
      var actorDir = fabs[iFab]._actorCons;
      if (actorDir.hasOwnProperty(type)) {
        return new actorDir[type](name);
      }
    }
    throw new Error("Unknown actor type '" + type + "'");
  },

  /**
   * An conceptual object in the test, usually represented as relatively inert
   *  data structures that the actors create/modify/etc.  Things do not have
   *  associated loggers but are sufficiently notable that they will be named by
   *  (test) loggers and their movement throughout a distributed system can be
   *  derived.  A thing may have multiple names/representations throughout its
   *  life cycle.  Much of the point of the thing abstraction is to allow us to
   *  tie all those representations together.
   *
   * Thing naming and reconstruction is accomplished by using consistent
   *  argument names across logging layers that are made known to the
   *  reconstruction layer.  Message layering/containment is accomplished
   *  by logging an event when the encapsulation/decapsulation occurs that
   *  contains both identifiers.
   *
   * Because things can be exist and need to be named prior to the true name
   *  they will eventually know, they are given unique identifiers within
   *  their containing namespaces.
   *
   * Things, like actors, can have convenience functions placed onto their
   *  prototype chain.  Their convenience functions
   */
  thing: function thing(type, name) {
    var thang = $log.makeThing(type, name);
    // poke it into our logger for reporting.
    this._log._named[thang._uniqueName] = thang;
    return thang;
  },

  _newStep: function(kind, args) {
    var actors = [], descBits = [];
    // args[:-1] are actors/description intermixed, args[-1] is the testfunc
    var iArg;
    for (iArg = 0; iArg < args.length - 1; iArg++) {
      var arg = args[iArg];
      if ($log.TestActorProtoBase.isPrototypeOf(arg))
        actors.push(arg);
      descBits.push(arg);
    }
    var testFunc = args[iArg];
    var step = new TestStep(this._log, kind, descBits, actors, testFunc);
    this.__steps.push(step);
    return step;
  },

  /**
   * Defines a test step/action.  Each action has a description that is made
   *  up of strings and actors (defined via `entity`).  All actors
   *  participating in/relevant to the test step must be named.  The last
   *  argument is always the test function to run to initiate the step/action.
   *
   * The step/action is marked complete when all of the expectations have been
   *  correctly satisfied.  The step fails and the test is aborted if unexpected
   *  non-boring logging invocations occur for the actors involved in the
   *  step.
   *
   * Actors defined in a test-case that are not involved in the step/action
   *  accumulate their entries which will be considered in the next step they
   *  are involved in, save for any entries filtered to be boring during that
   *  step.  This is intended to allow actions that have side-effects that
   *  affect multiple actors to be decomposed into specific pairwise
   *  interactions for clarity.
   */
  action: function action() {
    return this._newStep('action', arguments);
  },

  /**
   * Defines a step where two or more alternative actions should be run.
   *  Implicitly results in the test case as a whole being run a sufficient
   *  number of times to satisfy all contained permutations.
   */
  permutation: function permutation(variesDesc, variants) {
    var numVariants = variants.length;
    this._permutations *= numVariants;

    // The last numVariants steps should be what is handed to us.  If this
    //  is not the case, we are boned.
    var baseStep = this.__steps.length - numVariants;
    for (var i = 0; i < numVariants.length; i++) {
      if (variants[i] !== this.__steps[baseStep])
        throw new Error("Step sequence invariant violation");
    }
    // (use the splice retval rather than the passed in for extra safety)
    var saferVariants = this.__steps.splice(baseStep, numVariants);
    this.__steps.push(saferVariants);
  },

  /**
   * Define a setup test step.  While operationally the same as an action,
   *  setup steps are treated specially for reporting and aggregation purposes.
   *  Setup steps have less focus in the reporting UI, and a test that fails
   *  during its setup steps is treated differently than a test that fails
   *  during an action step.  The theory is that you should look at the tests
   *  that are failing during an action step before tests failing during a setup
   *  step because the setup failures are likely an outgrowth of the action
   *  failures of lower level tests.
   */
  setup: function() {
    return this._newStep('setup', arguments);
  },

  /**
   * Define a cleanup test step to perform any shutdown procedures to cleanup
   *  after a test that garbage collection would not take care of on its own.
   *  These steps should usually be automatically generated by testhelper
   *  logic for entities to match automatically generated setup steps.  They
   *  should also preferably be synchronous/fast.
   *
   * In the event that any step in a test fails, we still attempt to run all of
   *  the cleanup steps, even though they may also experience failures.
   */
  cleanup: function() {
    return this._newStep('cleanup', arguments);
  },
};
exports.TestContext = TestContext;

function TestCase(definer, kind, desc, setupFunc) {
  this.definer = definer;
  this.kind = kind;
  this.desc = desc;
  this.setupFunc = setupFunc;

  this.log = LOGFAB.testCase(this, definer._log, desc);

  this.context = null;
}
TestCase.prototype = {
};

function TestDefiner(modname, logfabs) {
  this.__logfabs = Array.isArray(logfabs) ? logfabs : [logfabs];

  this._log = LOGFAB.testDefiner(this, null, modname);

  this.__testCases = [];
}
TestDefiner.prototype = {
  _newCase: function(kind, desc, setupFunc) {
    var testCase = new TestCase(this, kind, desc, setupFunc);
    this.__testCases.push(testCase);
  },

  /**
   * Something that does not happen outside of a unit testing environment but
   *  serves as a useful functional test.
   */
  artificialCase: function artificialCase(desc, setupFunc) {
    this._newCase('artificial', desc, setupFunc);
  },

  /**
   * Something realistic that is expected to happen a lot.
   */
  commonCase: function commonCase(desc, setupFunc) {
    this._newCase('common', desc, setupFunc);
  },

  /**
   * Something realistic that is expected to happen rarely.
   */
  edgeCase: function edgeCase(desc, setupFunc) {
    this._newCase('edge', desc, setupFunc);
  },
};

exports.defineTestsFor = function defineTestsFor(testModule, logfabs) {
  return new TestDefiner(testModule.id, logfabs);
};

var LOGFAB = exports.LOGFAB = $log.register(null, {
  testDefiner: {
    implClass: TestDefiner,
    type: $log.TEST_DRIVER,
    subtype: $log.TEST_GROUP,
    asyncJobs: {
      run: {},
    },
    latchState: {
      result: false,
    }
  },
  testCase: {
    implClass: TestCase,
    type: $log.TEST_DRIVER,
    subtype: $log.TEST_CASE,
    asyncJobs: {
      run: {},
    },
    latchState: {
      result: false,
    }
  },
  testCasePermutation: {
    implClass: TestContext,
    type: $log.TEST_DRIVER,
    subtype: $log.TEST_PERMUTATION,
    asyncJobs: {
      run: {},
    },
    calls: {
      setupFunc: {},
    },
    latchState: {
      result: false,
    }
  },
  testStep: {
    implClass: TestStep,
    type: $log.TEST_DRIVER,
    subtype: $log.TEST_STEP,

    asyncJobs: {
      run: {},
    },
    calls: {
      stepFunc: {},
    },
    latchState: {
      result: false,
    }
  },
});

}); // end define
