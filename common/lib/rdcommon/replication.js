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
 * Defines replication levels that convey how synchronized clients are with
 *  their mailstore.  This is primarily required because we maintain a
 *  finite transaction log and if a device gets too behind we will run out of
 *  transaction log and will need the device to start from scratch (although it
 *  may want to hold onto local modifications/composed messages/etc.).
 **/

define(
  [
    'exports'
  ],
  function(
    exports
  ) {

/**
 * The client is stateless and remembers absolutely nothing about the
 *  mailstore's contents between connections.  This would correspond to a
 *  web-app that somehow has crypto keys or an ambient information device that
 *  is just a visualization on some server criteria or something.
 */
exports.RL_STATELESS = 0;

/**
 * The client subscribes to some subset of data, probably a combination of
 *  time-bounded subscriptions to various queues.
 */
exports.RL_SUBSCRIPTION_SUBSET = 1;

/**
 * The client is/wants to be a full replica.
 */
exports.RL_FULL = 256;

}); // end define
