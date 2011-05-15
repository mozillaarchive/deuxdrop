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
 *  be application specific things, as well as the determination of what is
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

var DummyLogProtoBase = {
};

var LogProtoBase = {
};

var TestProtoBase = {
  /**
   * Issue a promise that will be resolved when all expectations of this entity
   *  have been resolved.  If no expectations have been issued, just return
   *  null.
   */
  __waitForExpectations: function() {
  },

  __resetExpectations: function() {
  },
};

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
  // testing entity for expectations, etc.
  this.testProto = {__proto__: TestProtoBase};
}
LoggestClassMaker.prototype = {
  addStateVar: function(name) {
    this.logProto[name] = function(val) {
    };

    this.testProto['expect_' + name] = function(val) {
    };
  },
  addEvent: function(name, args) {
  },
  addCall: function(name, logArgs) {
  },
  addError: function(name, args) {
  }
};

exports.register = function register(mod, defs) {
  var fab = {_testEntities: {}};
  var testEntities = fab._testEntities;

  for (var defName in defs) {
    var loggerDef = defs[defName];

  }

  return fab;
};

// role information
exports.CONNECTION = 'connection';
exports.SERVER = 'server';
exports.CLIENT = 'client';

}); // end define
