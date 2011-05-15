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
 **/

define(
  [
    './log',
    'exports'
  ],
  function(
    $log,
    exports
  ) {

function TestStep(descBits, entities, testFunc) {
  this.descBits = descBits;
  this.entities = entities;
  this.testFunc = testFunc;
}
TestStep.prototype = {
};

/**
 * TestContexts are used to create entities and define the actions that define
 *  the steps of the test.
 */
function TestContext() {
  this._permutations = 1;
  this._steps = [];
}
TestContext.prototype = {
  entity: function entity() {
  },

  /**
   * Defines a test step/action.  Each action has a description that is made
   *  up of strings and entities (defined via `entity`).  All entities
   *  participating in/relevant to the test step must be named.  The last
   *  argument is always the test function to run to initiate the step/action.
   *
   * The step/action is marked complete when all of the expectations have been
   *  correctly satisfied.  The step fails and the test is aborted if unexpected
   *  non-boring logging invocations occur for the entities involved in the
   *  step.
   *
   * Entities defined in test-case that are not involved in the step/action
   *  accumulate their entries which will be considered in the next step they
   *  are involved in, save for any entries filtered to be boring during that
   *  step.
   */
  action: function action() {
    var entities = [], descBits = [];
    // args[:-1] are entities/description intermixed, args[-1] is the testfunc
    var iArg;
    for (iArg = 0; iArg < arguments.length - 1; iArg++) {
      var arg = arguments[iArg];
      if (arg instanceof $log.TestEntityProtoBase)
        entities.push(arg);
      descBits.push(arg);
    }
    var testFunc = arguments[iArg];

    var step = new TestStep(descBits, entities, testFunc);
    this._steps.push(step);
    return step;
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
   * Define a cleanup
   */
  cleanup: function() {
  },
};

function TestCase(kind, desc, setupFunc) {
  this.kind = kind;
  this.desc = desc;
  this.setupFunc = setupFunc;

  this.context = null;
}
TestCase.prototype = {
  _setupTest: function() {
  },
  /**
   * Run the setup function to configure everything, then
   */
  runTest: function() {
    this.context = new TestContext(this);

  }
};

function TestDefiner(logfab) {
  this._logfab = logfab;
}
TestDefiner.prototype = {
  commonCase: function commonCase(desc, setupFunc) {
  },

  edgeCase: function edgeCase(desc, setupFunc) {
  },
};

exports.defineTestsFor = function defineTestsFor(testModule, logfab) {
  var localDefiner = new TestDefiner(logfab);

  return localDefiner;
};

}); // end define
