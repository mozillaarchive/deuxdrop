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
 * A mechanism to assist in easily decorating objects/classes so that they
 *  can generate test-only behaviour-changing logic that cleans up our
 *  test runs in order to make the log output more comprehensible.
 *
 * This functionality should only be used in situations where different
 *  execution contexts operating with message-passing semantics can be reliably
 *  expected to not change their outcome when this is occurring.  Our goal is
 *  to eliminate confusing interleaving in reality rather than attempting to
 *  pretend the interleaving did not happen from a UI-display perspective and
 *  risk badly misleading the user.  Another option is to actually run the
 *  code in reliably isolated contexts, but we are not there yet.
 *
 * All wrapped instances are expected to be associated with a specific
 *  testhelper they are used by and as such are expected to have pre-defined
 *  logger entries on the helper's logger associated with them.
 *
 * @typedef[HoldHelperFunc @func[
 *   @return[String]{
 *     The key that characterizes what hold-queue this invocation should be
 *     placed in.
 *   }
 * ]
 **/

define(
  [
    'exports'
  ],
  function(
    exports
  ) {

function WrapMaker(wrapDef) {
  this.def = wrapDef;
  this.protish = null;
}
WrapMaker.prototype = {
  toString: function() {
    return '[WrapMaker]';
  },
  toJSON: function() {
    return {type: 'WrapMaker'};
  },
  defineHoldPool: function(poolName) {
    const holdPoolAttr = "__hpool_" + poolName,
          holdEnabledAttr = "__hen_" + poolName;
    this.protish['__hold_' + poolName] = function(doHold) {
      this[holdEnabledAttr] = doHold;
      if (!doHold) {
        var holdPool = this[holdPoolAttr];
        for (var key in holdPool) {
          var queue = holdPool[key];
          if (queue.length)
            throw new Error("non-empty hold queue '" + key +
                            "' in pool '" + poolName + "'");
        }
      }
    };
  },

  defineHoldReleaseFunc: function(poolName,
                                  wrapName,
                                  origFunc,
                                  holdKeyMaker,
                                  releaseKeyMaker) {
    const holdPoolAttr = "__hpool_" + poolName,
          holdEnabledAttr = "__hen_" + poolName;
    this.protish[wrapName] = function() {
      if (!this[holdEnabledAttr])
        return origFunc.apply(this, arguments);
      var holdKey = holdKeyMaker.apply(this, arguments);
      var holdPool = this[holdPoolAttr], holdQueue;
      if (!holdPool.hasOwnProperty(holdKey))
        holdQueue = holdPool[holdKey] = [];
      else
        holdQueue = holdPool[holdKey];
      holdQueue.push([origFunc, this, arguments]);
      return undefined;
    };
    this.protish["__release_" + wrapName] = function() {
      var holdKey = releaseKeyMaker.apply(this, arguments);
      var holdPool = this[holdPoolAttr];
      if (!holdPool.hasOwnProperty(holdKey))
        throw new Error("No such pool queue");
      var holdQueue = holdPool[holdKey];

      if (holdQueue.length === 0)
        throw new Error("Hold pool '" + poolName + "' with key '" +
                        holdKey + "' is empty!");
      var invocTup = holdQueue.shift();
      invocTup[0].apply(invocTup[1], invocTup[2]);

      return holdQueue.length;
    };
    // this is the same as the above but we don't return the queue length
    this.protish["__release_and_peek_" + wrapName] = function() {
      var holdKey = releaseKeyMaker.apply(this, arguments);
      var holdPool = this[holdPoolAttr];
      if (!holdPool.hasOwnProperty(holdKey))
        throw new Error("No such pool queue");
      var holdQueue = holdPool[holdKey];

      var invocTup = holdQueue.shift();
      // !!this is the bit that differs!!
      return invocTup[0].apply(invocTup[1], invocTup[2]);
    };
  },

  processWrapDef: function() {
    var superProto = this.def.implConstructor.prototype;

    this.defineHoldPool('all');

    var def = this.def;
    for (var key in def.holders) {
      this.defineHoldReleaseFunc('all', key, superProto[key],
                                 def.holders[key], def.releasers[key]);
    }
  },

  makeWrapFactory: function() {
    var trueCon = this.def.implConstructor;
    this.protish = {
      __proto__: trueCon.prototype,
    };
    this.processWrapDef();

    var wrapCon = function(logger, args) {
      trueCon.apply(this, args);
      this.__hpool_all = {};
      this.__hen_all = false;
      this.__wraplog = logger;
    };
    wrapCon.prototype = this.protish;
    return function(logger, args) {
      var inst = new wrapCon(logger, args);
      return inst;
    };
  },

  makeInstanceWrapFunc: function() {
    var protish = this.protish = {};
    this.processWrapDef();

    var self = this;
    return function(inst, useLogger, args) {
      inst.__hpool_all = {};
      inst.__hen_all = false;
      inst.__wraplog = useLogger;
      inst.__wrapargs = args;
      for (var key in protish) {
        inst[key] = protish[key];
      }
      return inst;
    };
  },
};

/**
 * Wrap a constructor of a class to produce a factory that produces
 *  'wrapped' instances with the desired changes in play.
 *
 * Our wrapping is implemented by interposing a new prototype in the prototype
 *  chain that contains our replacement/decorating methods.
 * JS proxies would be another good way to accomplish this.
 *
 * @args[
 *   @param[wrapDef]
 * ]
 */
exports.wrapClassGimmeFactory = function wrapConstructor(wrapDef) {
  var maker = new WrapMaker(wrapDef);
  return maker.makeWrapFactory();
};

/**
 * Make a function that will wrap an existing instance of `implConstructor`
 *  so that it has our wrapper semantics.
 *
 * Our wrapping operates mix-in style; we set a bunch of attributes on the
 *  instance variable without doing any clever prototype interposition or
 *  the like.
 */
exports.makeInstanceWrapper = function makeInstanceWrapper(wrapDef) {
  var maker = new WrapMaker(wrapDef);
  return maker.makeInstanceWrapFunc();
};

}); // end define
