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
};

/**
 * Full logger prototype; instances accumulate log details but are intended by
 *  policy to not long anything considered user-private.  This differs from
 *  `TestLogProtoBase` which, in the name of debugging and system understanding
 *  can capture private data but which should accordingly be test data.
 */
var LogProtoBase = {
};

/**
 * Test (full) logger prototype; instances generate notifications for entity
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

var TestEntityProtoBase = {
  /**
   * Issue a promise that will be resolved when all expectations of this entity
   *  have been resolved.  If no expectations have been issued, just return
   *  null.
   */
  __waitForExpectations: function() {
  },

  __resetExpectations: function() {
    this._expectations.splice(0, this._expectations.length);
  },

  assertExpectations: function() {

  },
};
exports.TestEntityProtoBase = TestEntityProtoBase;

function NOP() {
}

/**
 * Builds the logging and testing helper classes for the `register` driver.
 *
 * It operates in a similar fashion to wmsy's ProtoFab mechanism; state is
 *  provided to helpers by lexically closed over functions.  No code generation
 *  is used, but it's intended to be an option.
 */
function LoggestClassMaker() {
  // steady-state minimal logging logger (we always want statistics!)
  this.dummyProto = {__proto__: DummyLogProtoBase};
  // full-logging logger
  this.logProto = {__proto__: LogProtoBase};
  // testing full-logging logger
  this.testLogProto = {__proto__: TestLogProtoBase};
  // testing entity for expectations, etc.
  this.testEntityProto = {__proto__: TestEntityProtoBase};

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

  addStateVar: function(name) {
    this._define(name, 'state');

    this.dummyProto[name] = NOP;

    this.logProto[name] = function(val) {
      this._entries.push([name, val, Date.now()]);
    };

    this.testLogProto[name] =

    this.testEntityProto['expect_' + name] = function(val) {
      this._expectations.push([name, val]);
    };
  },
  addEvent: function(name, args) {
    this._define(name, 'event');

    var numArgs = 0;
    for (var key in args) {
      numArgs++;
    }

    this.dummyProto[name] = function() {
      this._eventMap[name]++;
    };

    this.logProto[name] = function() {
      this._eventMap[name]++;
      var entry = [name];
      for (var iArg = 0; iArg < numArgs; iArg++) {
        entry.push(arguments[iArg]);
      }
      entry.push(Date.now());
      this._entries.push(entry);
    };

    this.testEntityProto['expect_' + name] = function() {
      var exp = [name];
      for (var iArg = 0; iArg < numArgs; iArg++) {
        exp.push(arguments[iArg]);
      }
      this._expectations.push(exp);
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
        rval = arguments[numLogArgs+1].apply(arguments[numLogArgs],
                                       Array.slice.call(arguments, iArg+2));
      }
      catch(ex) {
        // (call errors are events)
        this._eventMap[name]++;
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
        rval = arguments[numLogArgs+1].apply(arguments[numLogArgs],
                                       Array.slice.call(arguments, iArg+2));
        entry.push(Date.now());
      }
      catch(ex) {
        entry.push(Date.now());
        entry.push(ex);
        // (call errors are events)
        this._eventMap[name]++;
        rval = ex;
      }

      return rval;
    };

    this.testEntityProto['expect_' + name] = function() {
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
      this._eventMap[name]++;
    };

    this.logProto[name] = function() {
      this._eventMap[name]++;
      var entry = [name];
      for (var iArg = 0; iArg < numArgs; iArg++) {
        entry.push(arguments[iArg]);
      }
      entry.push(Date.now());
      this._entries.push(entry);
    };

    this.testEntityProto['expect_' + name] = function() {
      var exp = [name];
      for (var iArg = 0; iArg < numArgs; iArg++) {
        exp.push(arguments[iArg]);
      }
      this._expectations.push(exp);
    };
  },

  makeFabs: function() {
    var dummyCon = function dummyConstructor() {
    };
    dummyCon.prototype = this.dummyProto;

    var loggerCon = function loggerConstructor() {
    };
    loggerCon.prototype = this.logProto;

    /**
     * Determine whether to instantiate a dummy obj or a log obj.
     */
    var loggerDecisionFab = function loggerDecisionFab() {
    };

    /**
     * Create an instance of the tester object.
     */
    var testerCon = function testerConstructor() {
      this._expectations = [];
    };
    testerCon.prototype = this.testEntityProto;
  },
};

exports.register = function register(mod, defs) {
  var fab = {_testEntities: {}};
  var testEntities = fab._testEntities;

  for (var defName in defs) {
    var loggerDef = defs[defName];
    var maker = new LoggestClassMaker();

    var key;
    if ("stateVars" in loggerDef) {
      for (key in loggerDef.stateVars) {
        maker.addStateVar(key);
      }
    }
    if ("events" in loggerDef) {
      for (key in loggerDef.events) {
        maker.addEvent(key, loggerDef.events[key]);
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
  }

  return fab;
};

// role information
exports.CONNECTION = 'connection';
exports.SERVER = 'server';
exports.CLIENT = 'client';

}); // end define
