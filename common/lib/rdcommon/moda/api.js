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

const NS_PEEPS = 'peeps',
      NS_CONVBLURBS = 'convblurbs',
      NS_CONVALL = 'convall';


/**
 * Provides summary information about the peep's activities as they relate to
 *  our user: # of unread messages from the user, # of conversations involving
 *  the user, meta-data our user has annotated them with (ex: pinned).
 */
function PeepBlurb(_bridge, ourPoco, selfPoco,
                   numUnread, numConvs, pinned) {
  this._bridge = _bridge;
  this.ourPoco = ourPoco;
  this.selfPoco = selfPoco;
  this._numUnread = numUnread;
  this._numConvs = numConvs;
  this._pinned = pinned;
}
PeepBlurb.prototype = {
  // -- getters exist so writes loudly fail
  get pinned() {
    return this._pinned;
  },

  get numInvolvedConversations() {
    return this._numConvs;
  },

  get numUnreadAuthoredMessages() {
    return this._numUnread;
  },
};

function JoinMessage(_owner, inviter, invitee, receivedAt) {
  this._ownerConv = _owner;
  this.inviter = inviter;
  this.invitee = invitee;
  this.receivedAt = receivedAt;
}
JoinMessage.prototype = {
  type: 'join',
};

/**
 * Message representation; this is only ever provided in a single
 *  representation.
 */
function HumanMessage(_owner, author, composedAt, receivedAt, text) {
  this._ownerConv = _owner;
  this.author = author;
  this.composedAt = composedAt;
  this.receivedAt = receivedAt;
  this.text = text;
}
HumanMessage.prototype = {
  type: 'message',
  markAsLastSeenMessage: function() {
  },

  markAsLastReadMessage: function() {
  },
};

/**
 * Provides summary information about a conversation: its participants, initial
 *  message text, most recent activity, # of unread messages.
 */
function ConversationBlurb(_bridge, participants,
                           pinned, numUnread) {
  this._bridge = _bridge;
  this.participants = participants;
  // the messages have a reference to us and so cannot be created yet
  this.firstMessage = null;
  this.firstUnreadMessage = null;
  this._pinned = pinned;
  this._numUnread = numUnread;
}
ConversationBlurb.prototype = {
  get pinned() {
    return this._pinned;
  },
  get numUnreadMessages() {
    return this._numUnread;
  },
};

/**
 * All of the data about a conversation, including its messages.
 */
function ConversationInFull(_bridge, participants, messages, pinned) {
  this._bridge = bridge;
  this.participants = participants;
  this.messages = messages;
  this._pinned = pinned;
}
ConversationInFull.prototype = {
  get pinned() {
    return this._pinned;
  },

  writeMessage: function(text) {
  },
};

/**
 * An ordered set (aka list).
 */
function LiveOrderedSet(handle, ns, query) {
  this._handle = handle;
  this._ns = ns;
  this._dataByNS = {
    peeps: {},
    convblurbs: {},
    convall: {},
  };
  this.query = query;
}
LiveOrderedSet.prototype = {
  _notifySplice: function(index, howMany, addedItems) {
  },
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
  this._sets = [];
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

  /**
   * @args[
   *   @param[msg @dict[
   *     @key[handle]
   *     @key[op @oneof['initial' 'update' 'dead']]
   *     @key[splices]
   *     @key[dataMap]
   *     @key[dataDelta]
   *   ]]
   * ]
   */
  _receive: function(msg) {
    if (!this._handleMap.hasOwnProperty(msg.handle))
      throw new Error("Received notification about unknown handle: " +
                      msg.handle);
    var liveset = this._handleMap[msg.handle];
    if (liveset === null) {
      // if this is the other side confirming the death of the query, delete it
      //  from our table
      if (msg.op === 'dead')
        delete this._handleMap[msg.handle];
      // (otherwise this is a notifcation we no longer care about)
      return;
    }

    // -- perform transformation / cache unification
    // We perform these in the order: peep, conv blurb, conv full because
    //  the dependency situation is such that peeps can't mention anything
    //  else (directly), and conversations can reference peeps.
    // An intentional effect of this is that it is okay for subsequent steps to
    //  use _dataByNS to peek into the liveset for their dependencies rather
    //  than needing to use _cacheLookupOrExplode themselves.
    // Messages aren't treated separately because they are immutable and small
    //  so we don't care about tracking them independently.
    var i, key, values, val, dataMap;
    if (msg.dataMap.hasOwnProperty(NS_PEEPS)) {
      values = msg.dataDelta[NS_PEEPS];
      dataMap = liveset._dataByNS[NS_PEEPS];
      for (key in values) {
        val = values[key];
        // null (in the non-delta case) means pull it from cache
        if (val === null)
          dataMap[key] = this._cacheLookupOrExplode(NS_PEEPS, key);
        else
          dataMap[key] = this._transformPeepBlurb(val, liveset);
      }
    }
    if (msg.dataDelta.hasOwnProperty(NS_PEEPS)) {
    }
    if (msg.dataMap.hasOwnProperty(NS_CONVBLURBS)) {
      values = msg.dataDelta[NS_CONVBLURBS];
      dataMap = liveset._dataByNS[NS_CONVBLURBS];
      for (key in values) {
        val = values[key];
        // null (in the non-delta case) means pull it from cache
        if (val === null)
          dataMap[key] = this._cacheLookupOrExplode(NS_CONVBLURBS, key);
        else
          dataMap[key] = this._transformConvBlurb(val, liveset);
      }
    }
    if (msg.dataDelta.hasOwnProperty(NS_CONVBLURBS)) {
    }
    if (msg.dataMap.hasOwnProperty(NS_CONVALL)) {
      values = msg.dataDelta[NS_CONVALL];
      dataMap = liveset._dataByNS[NS_CONVALL];
      for (key in values) {
        val = values[key];
        // null (in the non-delta case) means pull it from cache
        if (val === null)
          dataMap[key] = this._cacheLookupOrExplode(NS_CONVALL, key);
        else
          dataMap[key] = this._transformConvFull(val, liveset);
      }
    }
    if (msg.dataDelta.hasOwnProperty(NS_CONVALL)) {
    }

    // -- populate / apply the splices.
    for (i = 0; i < msg.splices.length; i++) {
      dataMap = liveset._dataByNS[liveset._ns];
      var spliceInfo = msg.splices[i];
      var objItems = [];
      for (var iName = 0; iName < spliceInfo.items.length; iName++) {
        objItems.push(dataMap[spliceInfo.items[iName]]);
      }
      liveset._notifySplice(spliceInfo.index, spliceInfo.howMany, objItems);
    }
  },

  /**
   * Look up the associated representation that we know must exist somewhere.
   */
  _cacheLookupOrExplode: function(ns, localName) {
    var sets = this._sets;
    for (var iSet = 0; iSet < sets.length; iSet++) {
      var lset = sets[iSet];
      var nsMap = lset._dataByNS[ns];
      if (nsMap.hasOwnProperty(localName))
        return nsMap[localName];
    }
    throw new Error("No such entry in namespace '" + ns + "' with name '" +
                    localName + "'");
  },

  /**
   * Create a `PeepBlurb` representation from the wire rep.
   */
  _transformPeepBlurb: function(data, /* unused */ liveset) {
    return new PeepBlurb(this, data.ourPoco, data.selfPoco,
                         data.numUnread, data.numConvs, data.pinned);
  },

  /**
   * Create a `Message` representation from the wire rep.
   */
  _transformMessage: function(msg, owner, liveset) {
    switch (msg.type) {
      case 'message':
        return new HumanMessage(
          owner,
          liveset._dataByNS.peeps[msg.author],
          new Date(msg.composedAt),
          new Date(msg.receivedAt),
          msg.text
        );
      case 'join':
        return new JoinMessage(
          owner,
          liveset._dataByNS.peeps[msg.inviter],
          liveset._dataByNS.peeps[msg.invitee],
          new Date(msg.receivedAt)
        );
      default:
        throw new Error("Unhandled message type: '" + msg.type + "'");
    }
  },

  /**
   * Create a `ConversationBlurb` representation from the wire rep.
   */
  _transformConvBlurb: function(wireConv, liveset) {
    var participants = [];
    for (var i = 0; i < wireConv.participants.length; i++) {
      participants.push(liveset._dataByNS.peeps[wireConv.participants[i]]);
    }
    var blurb = new ConversationBlurb(
      this, participants, wireConv.pinned, wireConv.numUnread
    );
    blurb.firstMessage =
      this._transformMessage(wireConv.firstMessage, blurb, liveset);
    blurb.firstUnreadMessage =
      this._transformMessage(wireConv.firstUnreadMessage, blurb, liveset);
    return blurb;
  },

  /**
   * Create a `ConversationInFull` representation from the wire rep.
   */
  _transformConvFull: function(data, liveset) {
    var participants = [];
    for (var i = 0; i < wireConv.participants.length; i++) {
      participants.push(liveset._dataByNS.peeps[wireConv.participants[i]]);
    }
    var messages = [];
    var conv = new ConversationInFull(
      this, participants, messages, wireConv.pinned
    );
    for (var iMsg = 0; iMsg < wireConv.messages.length; iMsg++) {
      messages.push(
        this._transformConvFull(wireConv.messages[iMsg], conv, liveset));
    }
    return conv;
  },



  //////////////////////////////////////////////////////////////////////////////
  // Data Queries

  queryPeeps: function(query) {
    var handle = this._nextHandle++;
    var liveset = new LiveOrderedSet(handle, query);
    this._handleMap[handle] = liveset;
    this._sets.push(liveset);
    this._send('queryPeeps', handle, query);
    return liveset;
  },

  queryPeepConversations: function(peep, query) {
    var handle = this._nextHandle++;
    var liveset = new LiveOrderedSet(handle, query);
    this._handleMap[handle] = liveset;
    this._sets.push(liveset);
    this._send('queryPeeps', handle, {peep: peep._id, query: query});
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
