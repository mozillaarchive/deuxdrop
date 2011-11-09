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
    './webdriver',
    'exports'
  ],
  function(
    $Q,
    $log,
    $webdriver,
    exports
  ) {

// nb: the Webdriver when, not Q's when.
const when = webdriver.promise.when;

function LoggestWebDriver(name, T, _logger) {
  this._T = T;

  this._actor = T.actor('loggestWebDriver', name, null, this);
  this._log = LOGFAB.loggestWebDriver(this, _logger, name);

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
LoggestWebDriver.prototype = {

  navigate: function(url) {
    this._actor.expect_navigate(url);
    var self = this;
    this._driver.get(url).then(
      function() { self._log.navigate(url); },
      this._boundGenericErrHandler);
  },

  findElement: function(whatHow, optContext) {
  },

  findElements: function(whatHow, optContext) {
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
   * @args[
   *   @param[className]{
   *     The CSS class name to search for.
   *   }
   *   @param[context WebElement]
   *   @param[valueClassNames @listof[
   *     @list[
   *       @param[descendentClassName @oneof[null String]]{
   *         If the root node is to be used, null.  If a descendent node
   *         should be queried, its class name.
   *       }
   *       @param[cmd @oneof["text" "attr"]]
   *       @param[attrName #:optional String]
   *     ]
   *   ]]
   * ]
   */
  frobElementsByClass: function(className, context, valueClassNames) {

  },

  /**
   * Type inside a text box; specially called out because this does not merit
   *  an additional screenshot.
   */
  typeInTextBox: function() {
  },
};

var LOGFAB = exports.LOGFAB = $log.register($module, {
  loggestWebDriver: {
    // we are a client/server client, even if we are smart for one
    type: $log.TEST_SYNTHETIC_ACTOR,
    subtype: $log.CLIENT,

    events: {
      navigate: {url: true},
    },
    TEST_ONLY_events: {
    },

    errors: {
      unexpectedBadness: {err: $log.EXCEPTION},
    },
  },
});

}); // end define
