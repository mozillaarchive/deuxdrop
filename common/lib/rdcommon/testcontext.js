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

  this.log = LOGFAB.testStep(_log);
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
  this._steps = [];

  this._log = LOGFAB.testCase(testCase.definer._log);

  this._actors = [];
}
TestContext.prototype = {
  /**
   * A player in the test that does stuff; for example, a client or a server.
   *  An actor correlates with one or more loggers,
   */
  actor: function actor(type, name) {
    // -- instantiate
  },

  /**
   * An conceptual object in the test, usually represented as relatively inert
   *  data structures that the actors create/modify/etc.  Things do not have
   *  associated loggers but are sufficiently notable that they will be named by
   *  (test) loggers and their movement throughout a distributed system can be
   *  derived.  A thing may have multiple names/representations throughout its
   *  life cycle.  Much of the point of the thing abstraction is to allow us to
   *  tie all those representations together.
   */
  thing: function thing(type, name) {
  },

  _newStep: function(kind, args) {
    var actors = [], descBits = [];
    // args[:-1] are actors/description intermixed, args[-1] is the testfunc
    var iArg;
    for (iArg = 0; iArg < args.length - 1; iArg++) {
      var arg = args[iArg];
      if (arg instanceof $log.TestEntityProtoBase)
        actors.push(arg);
      descBits.push(arg);
    }
    var testFunc = args[iArg];
    var step = new TestStep(this._log, kind, descBits, actors, testFunc);
    this._steps.push(step);
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
    var baseStep = this._steps.length - numVariants;
    for (var i = 0; i < numVariants.length; i++) {
      if (variants[i] !== this._steps[baseStep])
        throw new Error("Step sequence invariant violation");
    }
    // (use the splice retval rather than the passed in for extra safety)
    var saferVariants = this._steps.splice(baseStep, numVariants);
    this._steps.push(saferVariants);
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

function TestCase(definer, kind, desc, setupFunc) {
  this.definer = definer;
  this.kind = kind;
  this.desc = desc;
  this.setupFunc = setupFunc;

  this.context = null;
}
TestCase.prototype = {
};

function TestDefiner(logfabs) {
  this.__logfabs = Array.isArray(logfabs) ? logfabs : [logfabs];

  this._log = LOGFAB.testDefiner(null);

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
  return new TestDefiner(logfabs);
};

var LOGFAB = $log.register(null, {
  testDefiner: {
    implClass: TestDefiner,
    type: $log.TEST_DRIVER,
    subtype: $log.TEST_GROUP,
    asyncJobs: {
      runTests: {},
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
      runPermutation: {},
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
    call: {
      stepFunc: {},
    },
    latchState: {
      result: false,
    }
  },
});

}); // end define
