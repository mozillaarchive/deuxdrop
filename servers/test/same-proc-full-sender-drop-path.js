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
 * Loopback testing of client -> mailsender -> maildrop -> client communication
 *  in a single process with realistic (if trusting) account establishment but
 *  magically known public keys in all cases.
 *
 * Logging brainstorming/expectations:
 *  + Unit Test Understanding
 *    - Want to know what the participants are and the high-level messages that
 *       are being exchanged, plus the ability to drill down into the messages.
 *      => logging should expose the actor (with type available)
 *      => message transmission should optionally have high-level logging
 *          associated in a way that provides us with the message or lets us
 *          sniff the payload
 *  + Unit Test Failure Diagnosis
 *    - Want to know what a good run looked like, and the differences between
 *       this run and that run.
 *      => the viewer has access to a data-store.
 *  + Debugging (General)
 *    - Want to be able to trace message delivery and related activities
 *       across the system.
 *      => Use global names where possible, perhaps identity key and message
 *          hashes and TCP endpoint identifiers should allow reconstitution.
 *      x> Having clients pass around extra identifiers seems dangerous.  (Do
 *          not provide attackers with anything they do not already have,
 *          although debugging tools will of course make making use of that
 *          info easier.)
 *  + System Understanding (Initial, non-live, investigative)
 *    - Likely want what unit test understanding provides but with higher level
 *       capabilities.
 *  + System Understanding (Steady-state with testing system)
 *    - Likely want initial understanding unit test-level data but with only
 *       the traffic information and no ability to see the (private) data.
 *  + Automated Performance Runs / Regression Detection
 *    - Want timestamps of progress of message delivery.
 *    - Want easily comparable data.
 *  + At Scale Performance Understanding
 *    - Want to know throughput, latency of the various parts of the system,
 *       plus the ability to sample specific trace timelines.
 *  + At Scale Debugging of specific failures (ex: 1 user having trouble)
 *    - Want to be able to enable logging for the specific user, trace
 *       across the system.
 *
 *  + General
 *    - Want to be able to easily diff for notable changes...
 *      => Markup or something should indicate values that will vary between
 *          runs.  (Maybe as part of context?)
 *
 *  + Logging efficiency
 *    - Want minimal impact when not enabled.
 *      - But willing to accept some hit for the benefit of logging.
 *      - Assume JITs can try and help us out if we help them.
 *    - Don't want to clutter up the code with logging code.
 *    - Don't want debugging logging code that can compromise privacy
 *       accidentally active.
 *      => Use decoration/monkeypatching for debugging logging, isolated in
 *          a sub-tree that can be completely excluded from the production
 *          build process.  Have the decoration/monkeypatching be loud
 *          about what it's doing or able to fail, etc.
 *    - Nice if it's obvious that we can log/trace at a point.
 *    => Place always-on event logging in the code at hand.
 *    => Use (pre-computed) conditionals or maybe alternate classes for
 *        runtime optional logging.
 *
 *  + Storage / Transit efficiency
 *    - Want logging for test runs broken up into initialization logging and
 *       per-test compartments.
 *    => Time-bucketing (per "channel") likely sufficient for debugging logging
 *        purposes.
 *    => Performance stuff that can't be reduced to time-series probably wants
 *        its own channel, and its data should be strongly biased to aggregates.
 **/

define(
  [
    'exports'
  ],
  function(
    exports
  ) {

// create the entities (and corresponding keys, identities)

J.artificialCase('loopback message transmission', function(T) {
  var client_a = T.entity('client', 'A');
  var client_b = T.entity('client', 'B');
  var drop_d = T.entity('drop', 'D');
  var sender_s = T.entity('sender', 'S');
  var msg = T.thing('message', 'msg');

  T.action(client_a, 'creates sender account with', sender_s, function() {
    client_a.signupWith(sender_s);
  });

  T.action(client_b, 'creates drop account with', drop_d, function() {
    client_b.signupWith(drop_d);
  });

  T.action(client_b, 'tells the drop it is friends with A', drop_d,
            function() {
    client_b.addContact(drop_d);
  });

  T.action(client_a, 'sends', msg, 'to', sender_s, 'and receives ack',
           function() {
    T.meanwhile(sender_s, 'forwards message to drop', drop_d);
    msg = client_a.writeMessageTo(client_b);
    client_a.sendMessageVia(sender_s);
  });

  T.action(client_b, 'asks drop for messages and gets the message', drop_d,
            function() {
    var received_msg = client_b.fetchMessage();

  });
});

}); // end define
