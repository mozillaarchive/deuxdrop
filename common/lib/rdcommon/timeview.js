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
 * Time-centric data views; storage and communication impact.
 *
 * Time is a very important dimension for messages and conversations.  As such,
 *  all storage is aware of time.  Of course, we can't just have a single view
 *  that is sorted by time and use that for everything; most of the time, it
 *  would be absurdly wasteful to filter it down to what we actually want.  We
 *  need to slice that all-seeing river-of-time view into more appropriate
 *  smaller views ahead of time.
 *
 * We accept that there is no way for a single view to provide us what we need
 *  for all use-cases, so we intentionally redundantly store data so that when
 *  we do need to seek, there is high locality and minimal filtering performed.
 *  We do, however, need to worry about too much redundancy having negative
 *  write duplication side-effects.
 *
 * Breakout:
 *
 * One-on-one communication (still brainstorming/in flux):
 * - Maintain per-queue catch-all message-centric time-views.
 * - Maintain per-other-person conversation-centric time-views.
 *
 * Group communication (theorized, not yet even to the flux stage):
 * - Maintain per-user indices to point at communication with specific users,
 *    but do not store full messages on a per-user basis.
 *
 **/

define(
  [
    'exports'
  ],
  function(
    exports
  ) {

}); // end define
