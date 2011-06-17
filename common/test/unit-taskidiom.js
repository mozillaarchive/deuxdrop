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
 * Test the task abstraction.
 **/

define(
  [
    'assert',
    'q',
    'rdcommon/log',
    'rdcommon/testcontext',
    'rdcommon/taskidiom',
    'module',
    'exports'
  ],
  function(
    assert,
    $Q,
    $log,
    $tc,
    $task,
    $module,
    exports
  ) {

var LOGFAB = exports.LOGFAB = $log.register($module, {});

var taskMaster = $task.makeTaskMasterForModule($module, LOGFAB);

// For realistic test framework integration, we need to do this before creating
//  the test definer.  XXX unfortunately, this can generate exceptions that may
//  hose up the test runner if it can't hear about our failure, and may not
//  be reported as failures properly... (we want to make sure that goes away).
var TestTask = taskMaster.defineTask({
  name: "testTask",
  steps: {
    oneAsync: function() {
      if (this.arg.failOn === 1)
        throw new Error("I was told to fail");
      this._oneDeferred = $Q.defer();
      return this._oneDeferred.promise;
    },
    twoSync: function() {
      if (this.arg.failOn === 2)
        throw new Error("I was told to fail");
    },
    // (we have a consecutive second synchronous step to test the loop)
    threeSync: function() {
      if (this.arg.failOn === 3)
        throw new Error("I was told to fail");
    },
    fourTaskAsync: function() {
      if (this.arg.failOn === 4)
        throw new Error("I was told to fail");
      if (this.arg.nested)
        return "nested";
      this._fourTask = new TestTask({failOn: null, nested: true}, this.log);
      return this._fourTask;
    },
  },
  impl: {
    resolveStepOne: function(val) {
      this._oneDeferred.resolve(val);
    },
    rejectStepOne: function(err) {
      this._oneDeferred.reject(err);
    },
    resolveStepFour: function(val) {
      this._fourTask.resolveStepOne();
    },
    rejectStepFour: function(err) {
      this._fourTask.rejectStepOne();
    },
  },
});


var TD = exports.TD = $tc.defineTestsFor($module, LOGFAB);

TD.commonCase('successful task', function(T) {
  var eTask = T.actor('testTask', 't'), task, taskPromise;
  var ePromise = T.lazyLogger('promise');

  T.action('create', eTask, function() {
    task = new TestTask({failOn: null, nested: false});
  });

  T.action('start', eTask, 'oneAsync blocks', function() {
    eTask.expect_oneAsync_begin();
    eTask.expect_oneAsync_call();

    $Q.when(task.run(), function() {
      ePromise.event('resolved');
    }, function() {
      ePromise.event('rejected');
    });
  });
  T.action('resolve oneAsync', eTask, 'proceeds through fourTaskAsync, blocks',
           function() {
    eTask.expect_oneAsync_end();
    // synchronous calls happens synchronously...
    eTask.expect_twoSync_begin();
    eTask.expect_twoSync_call();
    eTask.expect_twoSync_end();
    eTask.expect_threeSync_begin();
    eTask.expect_threeSync_call();
    eTask.expect_threeSync_end();
    // fourth one blocks on the task...
    eTask.expect_fourTaskAsync_begin();
    eTask.expect_fourTaskAsync_call();
    // note: we explicitly have _not_ defined an actor for the sub-task, so we
    //  do not need to write expectations against it, although all of its
    //  log entries will show up in the unit test!

    task.resolveStepOne();
  });

  T.action('resolve fourTaskAsync,', eTask, 'completes, resolving', ePromise,
           function() {
    eTask.expect_fourTaskAsync_end();
    ePromise.expect_event('resolved');

    task.resolveStepFour();
  });

});

/*
TD.commonCase('failing task due to step throwing', function(T) {
});

TD.commonCase('failing task due to promise rejection', function(T) {
});
*/

}); // end define
