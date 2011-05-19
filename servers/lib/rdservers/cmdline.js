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

require(
  {
    baseUrl: "../../../",
    packages: [
    ],
    paths: {
      rdservers: "servers/lib/rdservers",
      rdcommon: "common/lib/rdcommon",
      rdstests: "servers/tests",
      rdctests: "common/tests",
    },
  },
  [
    "nomnom",
    "q",
    "arbpl/hackjobs",
    "require"
  ],
  function(
    $nomnom,
    $Q,
    $hackjobs,
    $require
  ) {
var when = $Q.when;

var parser = $nomnom.globalOpts({
});

function run_server(options, sclass) {
}

parser.command('maildrop')
  .help("Run a maildrop node")
  .opts({
  })
  .callback(function(options) {
    $require(['rdservers/maildrop/server'], function($dropserver) {
      run_server(options, $dropserver.DropServer);
    });
  });

parser.command('mailsender')
  .help("Run a mailsender node")
  .opts({
  })
  .callback(function(options) {
    $require(['rdservers/mailsender/server'], function($sendserver) {
      run_server(options, $sendserver.SendServer);
    });
  });

parser.command('mailstore')
  .help("Run a mailstore node ONLY (no maildrop, no mailsender)")
  .opts({
  })
  .callback(function(options) {
    $require(['rdservers/mailstore/server'], function($storeserver) {
      run_server(options, $storeserver.StoreServer);
    });
  });

parser.command('mailcombo')
  .help("Run a maildrop/mailsender/mailstore combo node")
  .opts({
  })
  .callback(function(options) {
    $require(['rdservers/mailsender/server',
              'rdservers/maildrop/server',
              'rdservers/mailstore/server'],
             function($dropserver, $sendserver, $storeserver) {
      run_server(options, $dropserver.DropServer);
      run_server(options, $sendserver.SendServer);
      run_server(options, $storeserver.StoreServer);
    });
  });

parser.command('test')
  .help("Run tests!")
  .opts({
  })
  .callback(function(options) {
    // XXX !!! obviously, we want this to find tests, not have them be hardcoded
    $require(['rdcommon/testdriver', 'rdstests/auth-conn-loopback'],
             function($driver, $tmod) {
      when($driver.runTestsFromModule($tmod),
        function(result) {
          console.log(JSON.stringify(result, null, 2));
        });
    });
  });

// We need to do our own argv slicing to compensate for RequireJS' r.js
parser.parseArgs(process.argv.slice(3));

}); // end require
