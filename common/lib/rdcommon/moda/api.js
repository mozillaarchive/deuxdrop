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
 * NOTIONAL BRAINSTORMING LOCATION.  NOT USED FOR IMPLEMENTATION YET IF EVER.
 **/

define(
  [
    'exports'
  ],
  function(
    exports
  ) {

/**
 * Address-book type information about a person: their name, etc.
 */
function PeepCard() {
}
PeepCard.prototype = {
};

/**
 * Provides summary information about the peep's activities as they relate to
 *  our user: # of unread messages from the user, # of conversations involving
 *  the user.
 *
 * Contains a copy of the `PeepCard` for the user in question to name them.
 */
function PeepBlurb() {
}
PeepBlurb.prototype = {
};

/**
 * Message representation; this is only ever provided in a single
 *  representation.
 */
function Message() {
}
Message.prototype = {
};

/**
 * Provides summary information about a conversation: its participants, initial
 *  message text, most recent activity, # of unread messages.
 */
function ConversationBlurb() {
}
ConversationBlurb.prototype = {
};

/**
 * All of the data about a conversation, including its messages.
 */
function ConversationInFull() {
}
ConversationInFull.prototype = {
};

/**
 * An ordered set (aka list).
 */
function LiveOrderedSet(name, query) {
  this._name = name;
  this.query = query;
}
LiveOrderedSet.prototype = {
};

function ModaBridge(channelId) {
  this._chanId = channelId;

  this._nextName = 1;

  /**
   *
   */
  this._nameMap = {};
}
ModaBridge.prototype = {
  //////////////////////////////////////////////////////////////////////////////
  // Internals

  _send: function() {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Queries
  queryPeeps: function(query) {
    var name = this._nextName++;
    var liveset = new LiveOrderedSet(name, query);
    this._nameMap[name] = liveset;
    this._send('queryPeeps', name, query);
    return liveset;
  },

  //////////////////////////////////////////////////////////////////////////////
  // Actions


  //////////////////////////////////////////////////////////////////////////////
};

}); // end define
