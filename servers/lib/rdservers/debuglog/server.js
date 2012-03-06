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
 * Provides simple/hacky exposure of the round-robin time-reaped server logs via
 *  URL.  This module is only looped in when the server is run with a special
 *  command-line flag.
 *
 * The intent is to provide a super-easy way for developers to see what the
 *  server is getting up to.  Right now the idea is that the jetpack's built-in
 *  loggest UI can be repurposed to consume this data so there aren't any
 *  additional setup steps and we also aren't having to get the server serving
 *  static HTML too, etc.
 *
 * There are a lot of ways this could be improved, ideas include:
 * - Provide streaming updates via a websockets-type channel.
 * - Have the server just be able to push log entries somewhere; for super easy
 *    dev purposes, the server could just push the data at the jetpack instance.
 *    For more complicate situations, it would send it to an aggregating server.
 * - Do have the server be able to serve the static web interface content.
 *    Alternately, have a separate command/port so that we can reuse third party
 *    code better suited to the problem without having to cram more stuff into
 *    authconn.
 **/

define(
  [
    'timers',
    'q',
    'rdcommon/log', 'rdcommon/logreaper',
    'exports'
  ],
  function(
    $timers,
    $Q,
    $log, $logreaper,
    exports
  ) {

const MAX_LOG_BACKLOG = 60;

exports.makeServerDef = function(serverConfig) {
  console.log("!!! LOGGEST ROUND ROBIN LOGGING ACTIVE !!!");

  // - Spin up a log reaper for this server
  var LOG_REAPER = new $logreaper.LogReaper(serverConfig.rootLogger),
      LOG_SCHEMA = $log.provideSchemaForAllKnownFabs();

  var logbacklog = serverConfig.debuglogBacklog = [];
  $timers.setInterval(function() {
    var logTimeSlice = LOG_REAPER.reapHierLogTimeSlice();
    // if nothing interesting happened, this could be empty, yos.
    if (logTimeSlice.logFrag) {
      logbacklog.push(logTimeSlice);
      // throw something away if we've got too much stuff already
      if (logbacklog.length > MAX_LOG_BACKLOG)
        logbacklog.shift();
    }
  }, 1000);

  // - Enable logging of unhandled rejections (if Q is 'fancy')
  if ('loggingEnableFriendly' in $Q) {
    $Q.loggingEnableFriendly({
      // we always want to know about unhandled rejections in debug log mode
      unhandledRejections: function(ex) {
        serverConfig.rootLogger.unhandledRejection(ex);
      },
      // we want to know about all exceptions in our logic in superDebug mode
      exceptions: function(ex, where) {
        serverConfig.rootLogger.promiseException(where, ex);
      },
      // we want to know about all rejection call-sites in superDebug mode
      rejections: function(reason, alreadyResolved) {
        var exForLocation;
        try {
          throw new Error("Rejection call-stack and some...");
        }
        catch (ex) {
          exForLocation = ex;
        }
        // XXX we should potentially log the already resolved ones too, just
        //  under a different event type... like a warning...
        if (!alreadyResolved)
          serverConfig.rootLogger.promiseRejection(reason, exForLocation);
      },
    });
  }

  return {
    endpoints: {},
    urls: {
      '/debuglog/gimme.json': function(request, response) {
        // matching how clientdaemon bridges this...
        var contents = JSON.stringify({
          type: 'backlog',
          backlog: logbacklog,
          schema: LOG_SCHEMA,
        });

        response.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/plain;charset=utf-8'
        });
        response.write(contents, 'utf8');
        response.end();
      },
    },
  };
};

}); // end define
