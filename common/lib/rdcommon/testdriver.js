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
    'q', 'q-util',
    'exports'
  ],
  function(
    $Q, $Qutil,
    exports
  ) {
var when = $Q.when, whenAll = $Q.whenAll;

function TestRuntimeContext() {
}
TestRuntimeContext.prototype = {
};

/**
 * Consolidates the logic to run tests.
 */
function TestRunner(testDefiner) {
  this._testDefiner = testDefiner;
  this._runtimeContext = new TestRuntimeContext();
}
TestRunner.prototype = {
  runTestStep: function(step) {
    var iActor, actor;

    // -- notify the actors about their imminent use in a step
    for (iActor = 0; iActor < step.actors.length; iActor++) {
      actor = step.actors[iActor];
      actor.__prepForTestStep(this._runtimeContext);
    }

    // -- initiate the test function
    step.log.run_begin();
    step.log.stepFunc(null, step.testFunc);

    // -- wait on actors' expectations (if any) promise-style
    var promises = [], allGood = true;
    for (iActor = 0; iActor < step.actors.length; iActor++) {
      actor = step.actors[iActor];
      var waitVal = actor.__waitForExpectations();
      if ($Q.isPromise(waitVal))
        promises.push(waitVal);
      else if (!waitVal)
        allGood = false;
    }

    if (!promises.length) {
      step.log.run_end();
      step.log.result(allGood ? 'pass' : 'fail');
      return allGood;
    }
    else {
      return whenAll(promises, function passed() {
        step.log.run_end();
        step.log.result('pass');
        return allGood;
      }, function failed() {
        step.log.run_end();
        step.log.result('fail');
        return false;
      });
    }
  },

  runTestCasePermutation: function(testCase, permutationNum) {
    var deferred = $Q.defer(), self = this;

    // -- create / setup the context
    var context = new TestContext(testCase, 0);

    // - push the test-case logger on the logging context stack
    // (We want all new logged objects to be associated with the context since
    //  it should bound their lifetimes.  Although it is interesting to know
    //  what specific step a logger came-to-life, we expect that to occur via
    //  cross-referencing.  If we anchored loggers in their creating step then
    //  the hierarchy would be extremely confusing.)
    context.__setup();

    // -- process the steps



    // -- pop the test-case logger from the logging context stack

    return deferred.promise;
  },

  runTestCase: function(testCase) {
    return this.runTestCasePermutation(testCase, 0);
  },

  runAll: function() {
    var deferred = $Q.defer(), iTestCase = 0, definer = this._testDefiner,
        self = this;
    function runNextTestCase() {
      if (iTestCase >= definer._testCases.length) {
        deferred.resolve();
        return;
      }
      var testCase = definer._testCases[iTestCase++];
      when(self.runTestCase(testCase), runNextTestCase);
    }
    runNextTestCase();
    return deferred.promise;
  },
};

exports.runTestsFromModule = function runTestsFromModule(tmod) {
  var runner = new TestRunner(tmod.TD);
  return runner.runAll();
};

}); // end define
