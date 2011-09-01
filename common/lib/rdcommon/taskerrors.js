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
 * Define an explicit hierarchy of errors that can be used by tasks to convey
 *  semantic details about their failures and which can be used by a supervisory
 *  process to figure out whether they should be re-scheduled in the future.
 *
 * Sorta decision tree:
 * - Received a malformed data record:
 *   - That could be the result of an attempted replay-style attack:
 *      `MalformedOrReplayPayloadError`.
 *   - With no darker reason possible: `MalformedPayloadError`.
 * - Crypto badness (all exposed via `keyops.js`):
 *   - `BadBoxError`: a signcryption box was not valid.  This could be due to
 *     a corrupt ciphertext or the keys/nonce used were not the keys claimed.
 *   - `BadSignatureError`: a signature was not valid.  This could be due to a
 *     corrupt signed blob or the key used was not the key claimed.
 *   - Authorization problems:
 *     - At no time was the authorization ever valid:
 *       `NeverValidAuthorizationError`.
 *     - The authorization is valid for an interval, but not the requested one:
 *       `TimestampNotInRangeAuthorizationError`.
 *   - Self-ident key mismatch; a self-ident blob (that self-names its signing
 *     key) did not name the right key but was otherwise valid.
 *     `SelfIdentKeyMismatchError`.
 *   - `SecretKeyMisuseError`: trying to use a secret key for a purpose other
 *     than its tagged purpose.
 *   - General key mismatch catch-all: `KeyMismatchError`
 * - Legitimate-seeming user trying to do something they're not allowed to do:
 *   - And they knew about something they shouldn't know about:
 *     `UnauthorizedUserDataLeakError`.
 *   - Otherwise: `UnauthorizedUserError`.
 * - Legitimate-seeming user naming a name we have never heard of:
 *     `BadNameError`.
 * - Apparent invariant violation, likely a local cluster thing:
 *   - Someone else is trying to do this at the same time as us and may still
 *     be trying to do it (aka not obviously dead):
 *     `ApparentRaceMaybeLaterError`.
 *   - Someone already did what we're trying to do: `AlreadyHappenedError`.
 *     (Note: preferably not used in cases where a replay attack is possible.)
 *   - A pre-requisite step appears to not have successfully completed:
 *     `MissingPrereqFatalError`.
 * - An apparent outage is stopping us from doing this right now:
 *   `ApparentOutageMaybeLaterError`.
 **/

define(
  [
    'rdcommon/crypto/keyops',
    'exports'
  ],
  function(
    $keyops,
    exports
  ) {

exports.BadBoxError = $keyops.BadBoxError;
exports.BadSignatureError = $keyops.BadSignatureError;

exports.SelfIdentKeyMismatchError = $keyops.SelfIdentKeyMismatchError;
exports.KeyMismatchError = $keyops.KeyMismatchError;
exports.SecretKeyMisuseError = $keyops.SecretKeyMisuseError;

exports.InvalidAuthorizationError = $keyops.InvalidAuthorizationError;
exports.NeverValidAuthorizationError = $keyops.NeverValidAuthorizationError;
exports.TimestampNotInRangeAuthorizationError =
  $keyops.TimestampNotInRangeAuthorizationError;

/**
 * We received a badly formed payload; this should be used when a field is of
 *  the wrong type, an array is erroneously empty, or the like.  It should not
 *  be used if a signature fails to validate or keys do not match.  Those
 *  constitute more concerning errors for which we have other errors for.
 *
 * Possible explanations for such a thing:
 * - Someone's implementation bug.
 * - Malicious implementation probing us for weaknesses.
 * - Malicious implementation trying to waste our resources.
 */
var MalformedPayloadError = exports.MalformedPayloadError = function(msg) {
  Error.captureStackTrace(this, MalformedPayloadError);
  this.message = msg;
};
MalformedPayloadError.prototype = {
  __proto__: Error.prototype,
  name: 'MalformedPayloadError',
};

var MalformedOrReplayPayloadError = exports.MalformedOrReplayPayloadError =
      function(msg) {
  Error.captureStackTrace(this, MalformedOrReplayPayloadError);
  this.message = msg;
};
MalformedOrReplayPayloadError.prototype = {
  __proto__: Error.prototype,
  name: 'MalformedOrReplayPayloadError',
};


/**
 * An exception that can be used by a task to signify to aware parties that the
 *  task appears to already have been completed by some other task.  This
 *  strongly implies that it is okay to not re-schedule this task and that it
 *  is advisable to make a note of the failure so system flaws/failures can
 *  be addressed that might be causing redundant operations to be attempted.
 */
var AlreadyHappenedError = exports.AlreadyHappenedError = function(msg) {
  Error.captureStackTrace(this, AlreadyHappenedError);
  this.message = msg;
};
AlreadyHappenedError.prototype = {
  __proto__: Error.prototype,
  name: 'AlreadyHappenedError',
};

/**
 * An exception that can be used by a task to signify to aware parties that
 *  some data-structure that strong invariants declare should already exist
 *  in order for this task to be valid is missing.  Accordingly, this task
 *  is either indicative of a bad system failure that we were unable to
 *  identify as an outage, or a bad actor feeding us gibberish.
 *
 * A supervisor would likely want to divert the task to overflow-able
 *  storage in case investigation reveals a resolvable system failure.  The
 *  storage would want to overflow in such a way that good actors experiencing
 *  such a failure would not lose their data while bad actors would.  For
 *  example, a per-account-holder quota system where once the quota is exceeded
 *  the quota goes to zero and everything is discarded.  (We discard because
 *  it is likely that things are ordering dependent and if we pick and choose
 *  we're still losing a lot of data that does not appear valid anyways.)
 */
var MissingPrereqFatalError = exports.MissingPrereqFatalError =
    function(message) {
  Error.captureStackTrace(this, MissingPrereqFatalError);
  this.message = message;
};
MissingPrereqFatalError.prototype = {
  __proto__: Error.prototype,
  name: 'MissingPrereqFatalError',
};

/**
 * An exception that can be used by a task to signify to aware parties that the
 *  task cannot be completed right now but there is reason to suspect it could
 *  be completed in the future.  There are further subclasses to refine the
 *  semantics.
 *
 * Aware parties should be tracking the history of the task and perhaps the
 *  global state of the system and be able to figure out when they should
 *  entirely give up on a task.
 */
var MaybeLaterError = exports.MaybeLaterError = function(message) {
  Error.captureStackTrace(this, MaybeLaterError);
  this.message = message;
};
MaybeLaterError.prototype = {
  __proto__: Error.prototype,
  name: 'MaybeLaterError',
};

/**
 * Signify to aware parties that there appears to be a transient outage that
 *  makes us unable to complete the task in a timely fashion, but that should be
 *  addressable in the future.
 *
 * A supervisor would likely want to retry periodically or when outages are
 *  known to be resolved and not kill-off the task until it is clear there are
 *  no outages and this is just an erroneous failure.
 */
var ApparentOutageMaybeLaterError = exports.ApparentOutageMaybeLaterError =
  function(message) {
  Error.captureStackTrace(this, ApparentOutageMaybeLaterError);
  this.message = message;
};
ApparentOutageMaybeLaterError.prototype = {
  __proto__: MaybeLaterError.prototype,
  name: 'ApparentOutageMaybeLaterError',
};

/**
 * Signify to aware parties that the state of a data structure we came across
 *  suggests that we are either running concurrently with a pre-requisite task
 *  or that the pre-requisite task died before it ran to completion.
 *
 * It may be appropriate to have another variant for the case where we can tell
 *  that our pre-requisite is dead and in a partial state.
 */
var ApparentRaceMaybeLaterError = exports.ApparentRaceMaybeLaterError =
  function(message) {
  Error.captureStackTrace(this, ApparentRaceMaybeLaterError);
  this.message = message;
};
ApparentRaceMaybeLaterError.prototype = {
  __proto__: MaybeLaterError.prototype,
  name: 'ApparentRaceMaybeLaterError',
};

/**
 * Signify to aware parties that someone without permission to do something is
 *  trying to do it.
 */
var UnauthorizedUserError = exports.UnauthorizedUserError =
  function(message) {
  Error.captureStackTrace(this, UnauthorizedUserError);
  this.message = message;
};
UnauthorizedUserError.prototype = {
  __proto__: Error.prototype,
  name: 'UnauthorizedUserError',
};

/**
 * Signify to aware parties that someone without permission to do something is
 *  trying to do it and worse yet, they know things that there is no way they
 *  should know if the system is operating correctly.
 *
 * We specifically would expect this in the following cases:
 * - Time warp.  The server is reverted to a back-up and so missed out on
 *    the information being relayed in an authorized fashion.  Alternatively,
 *    an actual time-hole.
 * - Data leak without full/sufficient credential leak.  Someone can read
 *    enough to know identifiers/what not, but did not gain access to the keys
 *    that would let them do this undetectably.  Someone must also not be super
 *    competent, because they should know they don't have the keys.  In the
 *    event of operable revocation that's not specially handled, this would also
 *    end up here.
 * - Unexpected races that are not properly handled.
 * - Lucky/clever brute-forcing.  Clever brute-forcing would imply we are
 *    leaking entropy somewhere.  In the case of brute-forcing, we would also
 *    expect a whole slew of other errors of some other category.
 */
var UnauthorizedUserDataLeakError = exports.UnauthorizedUserDataLeakError =
  function(message) {
  Error.captureStackTrace(this, UnauthorizedUserDataLeakError);
  this.message = message;
};
UnauthorizedUserDataLeakError.prototype = {
  __proto__: UnauthorizedUserError.prototype,
  name: 'UnauthorizedUserDataLeakError',
};


/**
 * They named something that does not exist as far as we know.  Note that this
 *  should not convey additional information to clients without thought, as we
 *  don't want them to be able to survey information out of us.
 */
var BadNameError = exports.BadNameError =
  function(message) {
  Error.captureStackTrace(this, BadNameError);
  this.message = message;
};
BadNameError.prototype = {
  __proto__: Error.prototype,
  name: 'BadNameError',
};

}); // end define
