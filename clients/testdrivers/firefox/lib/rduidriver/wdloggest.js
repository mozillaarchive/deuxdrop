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
 * WebDriver loggest hookup; wraps the webdriver API so that it integrates with
 *  the loggest framework and simplifies test writing.
 *
 * Our features/functionality:
 * - WebDriver API calls and their promise responses decorated into log
 *    entries.  We generate events when the promise completes instead of async
 *    jobs because we don't know when the actual dispatch takes place, and the
 *    ordering would get weird.
 * - WebElements passed-through, but you have to use them as opaque handles
 *    because we need to make the calls for you.
 * - (Eventually) the ability to automatically take screenshots before and after
 *    actions, providing annotation metadata about the location the action was
 *    taken.  (ex: if we are clicking a button, we include the location of the
 *    button in terms of screen coordinates so an overlay rectangle can be
 *    generated at display time.)
 **/

define(
  [
    'q',
    'rdcommon/log',
    'webdriver',
    'module',
    'exports'
  ],
  function(
    $Q,
    $log,
    $webdriver,
    $module,
    exports
  ) {

// nb: the Webdriver when, not Q's when.
const WDwhen = $webdriver.promise.when;

const DEFAULT_SERVER_URL = 'http://localhost:4444/wd/hub';

function LoggestWebDriver(name, RT, T, _logger) {
  this.RT = RT;
  this.T = T;

  this._actor = T.actor('loggestWebDriver', name, null, this);
  this._log = LOGFAB.loggestWebDriver(this, _logger, name);
  this._actor.__attachToLogger(this._log);

  $webdriver.process.setEnv(
    $webdriver.Builder.SERVER_URL_ENV, DEFAULT_SERVER_URL);

  this._builder = new $webdriver.Builder();
  this._builder.withCapabilities({
    browserName: 'firefox',
    platform: 'ANY',
    version: '',
    javascriptEnabled: true,
  });
  this._driver = this._builder.build();

  var self = this;
  this._boundGenericErrHandler = function(err) {
    self._log.unexpectedBadness(err);
  };
}
exports.LoggestWebDriver = LoggestWebDriver;
LoggestWebDriver.prototype = {

  navigate: function(url) {
    this.RT.reportActiveActorThisStep(this._actor);
    this._actor.expect_navigate(url);
    var self = this;
    this._driver.get(url).then(
      function(what) {
        if (what)
          self._log.navigateProblem(what);
        self._log.navigate(url);
      },
      this._boundGenericErrHandler);
  },

  /**
   * The JS to execute remotely in the context of the driven page; used by
   *  `frobElements`.
   */
  _rjs_frobElements: function(rootContext, rootGrabData) {
    if (!rootContext)
      rootContext = document;
    if (Array.isArray(rootContext)) {
      var curNode = rootContext[0];
      for (var i = 1; i < rootContext.length; i++) {
        curNode = curNode.getElementsByClassName[rootContext[i]][0];
      }
    }

    function frobRoots(context, grabData) {
      var localResults = [];
      var kidRoots = grabData.roots ?
                       context.getElementsByClassName(grabData.roots) :
                       [context];
      for (var iKidRoot = 0; iKidRoot < kidRoots.length; iKidRoot++) {
        var kidRoot = kidRoots[iKidRoot];

        var kidResult = [kidRoot];
        frobData(kidRoot, grabData.data, kidResult);
        localResults.push(kidResult);
      }
      return localResults;
    }
    function frobData(rootNode, grabData, localResults) {
      for (var iGrab = 0; iGrab < grabData.length; iGrab++) {
        var grabCmd = grabData[iGrab];

        if (!Array.isArray(grabCmd)) {
          localResults.push(frobRoots(rootNode, grabCmd));
          continue;
        }

        var subClass = grabCmd[0], subNode;
        if (subClass === null) {
          subNode = rootNode;
        }
        else {
          var nestedSubs = rootNode.getElementsByClassName(subClass);
          if (nestedSubs.length !== 1) {
            // there should only be one sub-node with the given class, provide
            //  a null result and go to the next sub-node...
            kidResult.push(null);
            continue;
          }
          subNode = nestedSubs[0];
        }
        switch (grabCmd[1]) {
          case 'node':
            kidResult.push(subNode);
            break;
          case 'text':
            kidResult.push(subNode.textContent);
            break;
          case 'attr':
            kidResult.push(subNode.getAttribute(grabCmd[2]));
            break;
          case 'jsprop':
            var valish = subNode;
            for (var iProp = 2; iProp < grabCmd.length; iProp++) {
              if (valish == null)
                break;
              valish = valish[grabCmd[iProp]];
            }
            kidResult.push(valish);
            break;
          case 'frob':
            kidresult.push(frobRoots(subNode, grabCmd[2]));
            break;
          default:
            kidresult.push('BADCOMMAND');
            break;
        }
      }
      return localResults;
    }
    if (Array.isArray())
      return frobData(rootContext, rootGrabData, []);
    else
      return frobRoots(rootContext, grabData);
  },

  /**
   * Helper method to extract a bunch of data from the DOM in a single go.
   *  This is intended to handle cases where we have N items being presented
   *  and we want to retrieve multiple pieces of data from each item.  Although
   *  we could accomplish that with the webdriver API, the number of round
   *  trips could get high and the DOM traversals could get expensive.  So
   *  we abstract it here, which is important/useful because we generate JS
   *  and ship it across the wire.
   *
   * The frob process works like this:
   * - Find all elements under `context` with the given class name.
   * - Process the list of data to grab in `grabData` for each node.  The
   *    first item names the className to use to find the single descendent
   *    with that class to use for data retrieval; or, if null is provided, we
   *    just use the root node.  The second item is the command, and any
   *    additional items are arguments to that command.
   *
   * @typedef[FrobExtractKids @dict[
   *   @key[roots @oneof[
   *     @case[null]
   *     @case["css class name" String]
   *   ]]
   *   @key[data FrobExtractData]
   * ]]
   * @typedef[FrobExtractData @listof[@oneof[
   *   @case[FrobExtractKids]
   *   @case[FrobExtractCmd]
   * ]]]
   * @typedef[FrobExtractCmd
   *     @list[
   *       @param[descendentClassName @oneof[null String]]{
   *         If the root node is to be used, null.  If a descendent node
   *         should be queried, its class name.
   *       }
   *       @param[cmd @oneof[
   *         @case["node"]{
   *           Retrieve the node itself, returned as a WebElement.
   *         }
   *         @case["text"]{
   *           Retrieve the textContent of the node.
   *         }
   *         @case["attr"]{
   *           Retrieve the value of an attribute on the node, where the
   *           attribute is named by the next item in the list.
   *         }
   *         @case["jsprop"]{
   *           Retrieve the value of a JS property on the node, where the
   *           property traversal is named by the subsequent items in the
   *           list.
   *         }
   *       ]]
   *       @param[attrName #:optional String]
   *     ]
   * ]
   * @args[
   *   @param[context @oneof[null WebElement]]{
   *     If null, use the document as the context, otherwise look for nodes
   *     under the provided WebElement.
   *   }
   *   @param[grabData @oneof[FrobExtractKids FrobExtractData]]
   * ]
   * @return[@promise[@listof[@list[
   *   @param[element WebElement]{
   *     An element located by `className` under `context`.
   *   }
   *   @rest[Object]{
   *     The result values from grabData.
   *   }
   * ]]]]
   */
  frobElements: function(context, grabData) {
    var deferred = $Q.defer(), self = this;
    this.RT.reportActiveActorThisStep(this._actor);
    this._actor.expect_frob();
    WDwhen(this._driver.executeScript(this._rjs_frobElements,
                                      context, grabData),
      function(results) {
        self._log.frob(results);
        deferred.resolve(results);
      },
      this._boundGenericErrHandler);
    return deferred.promise;
  },

  remoteExec: function(jsSnippet, logValue) {
    var self = this;
    this.RT.reportActiveActorThisStep(this._actor);
    this._actor.expect_remoteExec(logValue);
    WDwhen(this._driver.executeScript(jsSnippet),
      function() {
        self._log.remoteExec(logValue);
      },
      this._boundGenericErrHandler);
  },

  waitForRemoteCallback: function(jsSnippet, logValue) {
    var self = this;
    this.RT.reportActiveActorThisStep(this._actor);
    this._actor.expect_remoteCallback(logValue);
    WDwhen(this._driver.executeAsyncScript(jsSnippet),
      function() {
        self._log.remoteCallback(logValue);
      },
      this._boundGenericErrHandler);
  },

  /**
   * Remote JS to execute for `stealJSData` on the client.
   */
  _rjs_stealData: function(what) {
    var results = {};
    for (var outKey in what) {
      var traversal = what[outKey];
      var val = window;
      for (var i = 0; i < traversal.length; i++) {
        if (val == null)
          break;
        val = val[traversal[i]];
      }
      results[outKey] = val;
    }
    return results;
  },

  /**
   * Grab data accessible from the global 'window' namespace on the client.
   */
  stealJSData: function(logValue, what) {
    var deferred = $Q.defer(), self = this;
    this.RT.reportActiveActorThisStep(this._actor);
    this._actor.expect_stealJSData(logValue);
    WDwhen(this._driver.executeScript(this._rjs_stealData, what),
      function(results) {
        self._log.stealJSData(logValue, results);
        deferred.resolve(results);
      },
      this._boundGenericErrHandler);
    return deferred.promise;
  },

  click: function(what, context) {
    var self = this;
    this.RT.reportActiveActorThisStep(this._actor);
    this._actor.expect_click();
    if (!(what instanceof $webdriver.WebElement))
      what = (context || this.driver).findElement(what);
    WDwhen(what.click(), function() {
        self._log.click();
      },
      this._boundGenericErrHandler);
  },

  /**
   * Type inside a text box.
   */
  typeInTextBox: function(textbox, textToType, context) {
    var self = this;
    this.RT.reportActiveActorThisStep(this._actor);
    this._actor.expect_type(textToType);
    if (!(textbox instanceof $webdriver.WebElement))
      textbox = (context || this.driver).findElement(textbox);
    WDwhen(textbox.sendKeys(textToType), function() {
        self._log.type(textToType);
      },
      this._boundGenericErrHandler);
  },
};

var LOGFAB = exports.LOGFAB = $log.register($module, {
  loggestWebDriver: {
    // we are a client/server client, even if we are smart for one
    type: $log.TEST_SYNTHETIC_ACTOR,
    subtype: $log.CLIENT,

    events: {
      navigate: {url: true},
      click: {},
      type: {text: true},

      frob: {results: false},
      remoteExec: {event: true},
      remoteCallback: {event: true},
      stealJSData: {why: true, data: false},
    },
    TEST_ONLY_events: {
    },

    errors: {
      navigateProblem: { msg: false },
      unexpectedBadness: { err: $log.EXCEPTION },
    },
  },
});

}); // end define
