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
 * Spin up a page-worker that runs the loggest testdriver in said page-worker,
 *  making sure to cram any required globals in first.
 **/

let $self = require('self'),
    $nacl = require('nacl'); // jsctypes binding, yo

exports.testerUrl = $self.data.url("testing/logdriver.html");

// We can't inject things directly into a page-worker, so let's bail on this
//  and use a hidden frame for now.
/*
let $pworker = require('page-worker')

exports.goRunTest = function goRunTest(test, testName) {
  test.waitUntilDone(6 * 1000);
  var page = $pworker.Page({
    contentURL: exports.testerUrl + "?" + testName,
    onMessage: function(msg) {
      if (msg === "pass")
        test.pass();
      else
        test.fail();
      test.done();
      page.destroy();
    },
  });
};
*/

let $hframe = require('hidden-frame');

var gHiddenFrame;
exports.goRunTest = function goRunTest(test, testName) {
  test.waitUntilDone(10 * 1000);

  gHiddenFrame = $hframe.add($hframe.HiddenFrame({
    onReady: function() {
      // now that we have a frame, point it at a URL so we get a principal...
      // (we can remove this step once the bug noted above is fixed; we could
      //  also potentially avoid the hidden frame and just grab it out of the
      //  hidden window itself or what not.)
      this.element.contentWindow.location = exports.testerUrl + "?" + testName;

      let self = this;
      this.element.addEventListener("DOMContentLoaded", function() {
        let win = self.element.contentWindow;

        win.wrappedJSObject.$NACL = $nacl;
        win.wrappedJSObject.TESTDONE = function(msg) {
          if (msg === "pass")
            test.pass();
          else
            test.fail();
          test.done();
          gHiddenFrame.destroy();
        };
        // invoke it if it is there, otherwise, it has not yet been defined
        //  and when it gets defined it will see TESTDONE and autostart.
        if (win.wrappedJSObject.GO_RUN_TESTS)
          win.wrappedJSObject.GO_RUN_TESTS();
      }, true, true);
    }
  }));
};
