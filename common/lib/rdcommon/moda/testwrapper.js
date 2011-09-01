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
 * A testwrapper to wrap the receipt of messages from the `ModaBridge` to
 *  the `ModaBackside`.  This is somewhat hacky in that we don't care about
 *  cleaning up the logging output as much as we want the ability to get at
 *  the return value from the invocation of the `ModaBackside` commands.  By
 *  being hacky, we are able to get their returned values and therefore able to
 *  let the moda testing framework be able to get at things in a very similar
 *  fashion to how the `RawClient`-driving tests operate.  This allows reuse
 *  easily and is saving me a boatload of time.
 **/

define(
  [
    'rdcommon/testwrapmaker',
    './backside',
    'exports'
  ],
  function(
    $testwrapmaker,
    $moda_backside,
    exports
  ) {

exports.modaBacksideWrap = $testwrapmaker.makeInstanceWrapper({
  implConstructor: $moda_backside.ModaBackside,
  holders: {
    _received: function(boxedObj) {
      this.__wraplog.backsideReceived(boxedObj.cmd);
      return boxedObj.cmd;
    },
  },
  releasers: {
    _received: function(cmd) {
      return cmd;
    }
  },
});


}); // end define
