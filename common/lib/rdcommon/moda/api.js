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
  this.ourPoco;
  this.selfPoco;
}
PeepCard.prototype = {
};

/**
 * Provides summary information about the peep's activities as they relate to
 *  our user: # of unread messages from the user, # of conversations involving
 *  the user, meta-data our user has annotated them with (ex: pinned).
 *
 * Contains a copy of the `PeepCard` for the user in question to name them.
 */
function PeepBlurb() {
}
PeepBlurb.prototype = {
  get pinned() {
  },

  get numInvolvedConversations() {
  },

  get numUnreadAuthoredMessages() {
  },
};

/**
 * Message representation; this is only ever provided in a single
 *  representation.
 */
function Message(_fullConv) {
  this._fullConv = _fullConv;
}
Message.prototype = {
  markAsLastSeenMessage: function() {
  },

  markAsLastReadMessage: function() {
  },
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
function ConversationInFull(_bridge) {
  this._bridge = bridge;
}
ConversationInFull.prototype = {
  writeMessage: function(text) {
  },

  markAsSeenThrough: function() {
  },

  markAsReadThrough: function() {
  },
};

/**
 * An ordered set (aka list).
 */
function LiveOrderedSet(handle, ns, query) {
  this._handle = handle;
  this._ns = ns;
  this.query = query;
}
LiveOrderedSet.prototype = {
};

////////////////////////////////////////////////////////////////////////////////
// Notification Representations

function ConversationNotification() {
}
ConversationNotification.prototype = {
};

function ContactAddedNotification() {
}
ContactAddedNotification.prototype = {
};

function ContactRequestNotification() {
}
ContactRequestNotification.prototype = {
};

////////////////////////////////////////////////////////////////////////////////

function ModaBridge() {
  this._sendObjFunc = null;

  this._nextHandle = 0;

  this._handleMap = {};
}
exports.ModaBridge = ModaBridge;
ModaBridge.prototype = {
  //////////////////////////////////////////////////////////////////////////////
  // Internals

  _send: function(cmd, thisSideName, payload) {
    // pass it through a JSON transformation and back to make sure we don't
    //  accidentally transit objects.  (nb: I believe the JS engine can do
    //  faster things with the pure object rep, but it still amounts to JSON.)
    var str = JSON.stringify({cmd: cmd, name: thisSideName, payload: payload});
    this._sendObjFunc(JSON.parse(str));
  },

  /**
   * Normalize a list of peeps to their id's for transit to the back-end.
   */
  _normalizePeepsToIds: function(peeps) {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Data Queries

  queryPeeps: function(query) {
    var handle = this._nextHandle++;
    var liveset = new LiveOrderedSet(handle, query);
    this._handleMap[handle] = liveset;
    this._send('queryPeeps', handle, query);
    return liveset;
  },

  queryPeepConversations: function(peep, query) {
    var handle = this._nextHandle++;
    var liveset = new LiveOrderedSet(handle, query);
    this._handleMap[handle] = liveset;
    this._send('queryPeeps', handle, query);
    return liveset;
  },

  queryConversations: function(query) {
  },

  killQuery: function(liveSet) {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Actions

  /**
   * Connect to a new person using their self-ident blob.  This is being added
   *  for testing reasons right now, but theoretically this might happen on
   *  a desktop via drag-n-drop.
   *
   * Does not return anything because the connection process
   */
  connectToPeepUsingSelfIdent: function(selfIdentBlob, localPoco) {

  },

  connectToPeepUsingEmail: function(email, optionalMessage) {
  },

  /**
   * @args[
   *   @param[args @dict[
   *     @key[peeps]
   *     @key[text String]
   *     @key[location #:optional String]
   *   ]]
   * ]
   */
  createConversation: function(args) {
    var outArgs = {
      peeps: this._normalizePeepsToIds(args.peeps),
      messageText: args.text,
    };
    this._send('createConversation', null, outArgs);
    // XXX ideally we would want to return a blurb...
  },

  //////////////////////////////////////////////////////////////////////////////
  // Notification Queries
  //
  // These are posed as queries rather than straight-up change notifications
  //  because in the world of multiple clients we want to be able to take back
  //  notifications.  Also, we update the aggregate notifications as more come
  //  in.

  /**
   * @args[
   *   @param[listenerMap @dictof["event name" Function]]
   * ]
   */
  queryNotifications: function() {
  },

  //////////////////////////////////////////////////////////////////////////////
};

}); // end define
