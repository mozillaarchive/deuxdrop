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
 * Moda API, communicates via a postMessage bridge with the work thread.  This
 *  implementation tries to be more minimal/standalone than the rest of the
 *  system so we don't impose much on UI implementations beyond our excellent
 *  semantics.  The most obvious manifestation of this is we do not hook up
 *  to our logging system.  (System unit tests instead hook the logging system
 *  up to our consumer.)
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
      NS_CONVMSGS = 'convmsgs',
      NS_SERVERS = 'servers';


/**
 * Provides summary information about the peep's activities as they relate to
 *  our user: # of unread messages from the user, # of conversations involving
 *  the user, meta-data our user has annotated them with (ex: pinned).
 */
function PeepBlurb(_bridge, _localName, ourPoco, selfPoco,
                   numUnread, numConvs, pinned) {
  this._bridge = _bridge;
  this._localName = _localName;
  this.ourPoco = ourPoco;
  this.selfPoco = selfPoco;
  this._numUnread = numUnread;
  this._numConvs = numConvs;
  this._pinned = pinned;
}
PeepBlurb.prototype = {
  // -- getters exist so writes loudly fail
  get isContact() {
    return this.ourPoco !== null;
  },

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

/**
 * A message indicating that the `invitee` who was invited by the `inviter` has
 *  joined the conversation.
 *
 * @args[
 *   @param[_owner ConversationBlurb]
 *   @param[inviter PeepBlurb]
 *   @param[invitee PeepBlurb]
 *   @param[receivedAt Date]
 * ]
 */
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
 *
 * @args[
 *   @param[_owner ConversationBlurb]
 *   @param[author PeepBlurb]
 *   @param[composedAt Date]
 *   @param[receivedAt Date]
 *   @param[text String]{
 *     The (unformatted unless sent by a jerk) message text.  NEVER put this
 *     in an innerHtml field unless sanitized, and preferably not even then.
 *   }
 * ]
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
 *
 * Conversation blurbs are always held by `LiveOrderedSets` which provide their
 *  notifications about changes in their attributes.
 */
function ConversationBlurb(_bridge, _localName, participants,
                           pinned, numUnread) {
  this._bridge = _bridge;
  this._localName = _localName;
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

  /**
   * Reply to this conversation with a new (text) message.
   *
   * @args[
   *   @param[args @dict[
   *     @param[text String]
   *   ]]
   * ]
   */
  replyToConversation: function(args) {
    var msgData = {
      messageText: args.text,
    };
    this._bridge.send('replyToConv', this._localName, msgData);
  },

  /**
   * Invite a contact to join the conversation.  You cannot invite people to
   *  join conversations who the user has not established a mutual contact
   *  relationship with.
   *
   * @args[
   *   @param[peep PeepBlurb]{
   *     A `PeepBlurb` for which `PeepBlurb.isContact` is true.
   *   }
   * ]
   */
  inviteToConversation: function(peep) {
    if (!peep || !(peep instanceof PeepBlurb))
      throw new Error("You need to invite a PeepBlurb!");
    if (!peep.isContact)
      throw new Error("You can only invite contactss!");
    var invData = {
      peepName: peep._localName,
    };
    this._bridge.send('inviteToConv', this._localName, invData);
  },
};

/**
 * An ordered set (aka list).
 */
function LiveOrderedSet(_bridge, handle, ns, query, listener, data) {
  this._bridge = _bridge;
  this._handle = handle;
  this._ns = ns;
  this._dataByNS = {
    peeps: {},
    convblurbs: {},
    convmsgs: {},
    servers: {},
  };
  this.query = query;
  this.items = [];
  this.completed = false;
  this._listener = listener;
  this.data = data;
}
LiveOrderedSet.prototype = {
  /**
   * Generate a notification that one or more of the already-present members
   *  in the set of items has been modified.
   */
  _notifyItemsModified: function() {
    // XXX do.
  },

  /**
   * Generate a notification and perform the splice.  Note that the notification
   *  occurs *prior* to the splice since that is when the most information is
   *  available.
   */
  _notifyAndSplice: function(index, howMany, addedItems) {
    if (this._listener && this._listener.onSplice)
      this._listener.onSplice(index, howMany, addedItems, this);
    this.items.splice.apply(this.items, [index, howMany].concat(addedItems));
  },

  /**
   * Invoked after every update pass completes.
   */
  _notifyCompleted: function() {
    this.completed = true;
    if (this._listener && this._listener.onCompleted)
      this._listener.onCompleted(this);
  },

  /**
   * Closes the query so that we no longer receive updates about the query.
   *  Once this is invoked, the reference to the set and all of its contents
   *  should be dropped as they will no longer be valid or kept up-to-date.
   */
  close: function() {
    this._bridge.killQuery(this);
  },
};

/**
 * Provides information about a server.
 *
 * For pragmatic/laziness reasons, this representation unusually has the full
 *  crypto self-ident present, but it should never be exposed/to used by the
 *  user interface directly.
 */
function ServerInfo(_localName, url, displayName) {
  this._localName = _localName;
  this.url = url;
  this.displayName = displayName;
}
ServerInfo.prototype = {
};

/**
 * Represents the account information for the human being using this messaging
 *  system.  Provides the current portable contacts schema identifying the user
 *  to others and a means to change it.  Provides information on the account
 *  server being used, if any, and a way to perform initial signup.  There is
 *  no way to change the server used right now because we don't have migration
 *  implemented.
 */
function OurUserAccount(_bridge, poco, usingServer) {
  this._bridge = _bridge;
  this.poco = poco;
  this.usingServer = usingServer;

  /**
   * Callers who have invoked `whoAmI` but not gotten an onCompleted callback
   *  yet.
   */
  this._pendingListeners = [];
}
OurUserAccount.prototype = {
  get havePersonalInfo() {
    return !this.poco || !!this.poco.displayName;
  },

  get haveServerAccount() {
    return !!this.usingServer;
  },

  /**
   * Replace the current poco with a new set of detail.  Success is assumed.
   */
  updatePersonalInfo: function(newPoco) {
    this._bridge._send('updatePoco', null, newPoco);
  },

  provideProofOfIdentity: function(identityType, proofOrigin, proof) {
  },

  signupWithServer: function(serverInfo) {
    if (this.usingServer)
      throw new Error("Already signed up with a server!");

    this._bridge._send('signup', null, serverInfo._selfIdentBlob);
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

  /** next query handle name to issue (always allocated by us) */
  this._nextHandle = 0;
  /** @dictof["query handle name" LiveOrderedSet] */
  this._handleMap = {};
  /** @listof[LiveOrderedSet] */
  this._sets = [];

  /** `OurUserAccount` */
  this._ourUser = null;
}
exports.ModaBridge = ModaBridge;
ModaBridge.prototype = {
  toString: function() {
    return '[ModaBridge]';
  },
  toJSON: function() {
    return {type: 'ModaBridge'};
  },

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
   * Normalize a list of _localName'd objects to their local names.
   */
  _normalizeObjsToLocalNames: function(objs) {
    var localNames = [];
    for (var i = 0; i < objs.length; i++) {
      localNames.push(objs[i]._localName);
    }
    return localNames;
  },

  /**
   * Receive a message from the other side.  These are distinguished
   */
  _receive: function(msg) {
    switch (msg.type) {
      case 'whoAmI':
        return this._receiveWhoAmI(msg);
      case 'query':
        return this._receiveQueryUpdate(msg);
    }
    throw new Error("Received unknown message type: " + msg.type);
  },

  _transformServerInfo: function(_localName, serialized) {
    if (!serialized)
      return null;
    return new ServerInfo(_localName, serialized.url, serialized.displayName);
  },

  _receiveWhoAmI: function(msg) {
    // update the representation
    this._ourUser.poco = msg.poco;
    this._ourUser.usingServer = this._transformServerInfo(msg.server);

    // notify listeners
    for (var i = 0; i < this._ourUser._pendingListeners.length; i++) {
      this._ourUser._pendingListeners[i].onCompleted(this._ourUser);
    }
    this._ourUser._pendingListeners = [];
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
  _receiveQueryUpdate: function(msg) {
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

    // --- Data transformation / Cache unification
    // We perform these in the order: server, peep, conv blurb because
    //  the dependency situation is such that peeps can't mention anything
    //  else (directly), and conversations can reference peeps.
    // An intentional effect of this is that it is okay for subsequent steps to
    //  use _dataByNS to peek into the liveset for their dependencies rather
    //  than needing to use _cacheLookupOrExplode themselves.
    // Messages aren't treated separately because they are immutable and small
    //  so we don't care about tracking them independently.
    var i, key, values, val, dataMap;

    // -- Servers
    if (msg.dataMap.hasOwnProperty(NS_SERVERS)) {
      values = msg.dataMap[NS_SERVERS];
      dataMap = liveset._dataByNS[NS_SERVERS];
      for (key in values) {
        val = values[key];
        // null (in the non-delta case) means pull it from cache
        if (val === null)
          dataMap[key] = this._cacheLookupOrExplode(NS_SERVERS, key);
        else
          dataMap[key] = this._transformServerInfo(key, val);
      }
    }

    // -- Peeps
    if (msg.dataMap.hasOwnProperty(NS_PEEPS)) {
      values = msg.dataMap[NS_PEEPS];
      dataMap = liveset._dataByNS[NS_PEEPS];
      for (key in values) {
        val = values[key];
        // null (in the non-delta case) means pull it from cache
        if (val === null)
          dataMap[key] = this._cacheLookupOrExplode(NS_PEEPS, key);
        else
          dataMap[key] = this._transformPeepBlurb(key, val, liveset);
      }
    }
    if (msg.dataDelta.hasOwnProperty(NS_PEEPS)) {
      // XXX process pinned changes, number of associated convs, etc.
    }

    // -- Conv Blurbs
    if (msg.dataMap.hasOwnProperty(NS_CONVBLURBS)) {
      values = msg.dataMap[NS_CONVBLURBS];
      dataMap = liveset._dataByNS[NS_CONVBLURBS];
      for (key in values) {
        val = values[key];
        // null (in the non-delta case) means pull it from cache
        if (val === null)
          dataMap[key] = this._cacheLookupOrExplode(NS_CONVBLURBS, key);
        else
          dataMap[key] = this._transformConvBlurb(key, val, liveset);
      }
    }
    if (msg.dataDelta.hasOwnProperty(NS_CONVBLURBS)) {
      // XXX process pinned changes, unread count changes, etc.
    }

    // --- Populate The Set = Apply Splices or Special Case.

    // -- Special Case: Conv Messages
    // Note: this is a less straightforward mapping because our query is
    //  on a single conversation, but the ordered set contains the
    //  messages that are part of that conversation, so we need to 'explode'
    //  them out, as it were.
    if (liveset._ns === NS_CONVMSGS) {
      if (msg.dataMap.hasOwnProperty(NS_CONVMSGS)) {
        values = msg.dataMap[NS_CONVMSGS];
        dataMap = liveset._dataByNS[NS_CONVMSGS];

        // so there will only be one of these...
        for (key in values) {
          val = values[key];
          // null (in the non-delta case) means pull it from cache
          if (val === null)
            dataMap[key] = this._cacheLookupOrExplode(NS_CONVMSGS, key);
          else
            dataMap[key] = this._transformConvMessages(liveset.blurb,
                                                       key, val, liveset);

          // now, splice the messages in.
          liveset._notifyAndSplice(0, 0, dataMap[key].messages);
        }
      }
      // our deltas encode additional messages being added to a conv
      if (msg.dataDelta.hasOwnProperty(NS_CONVMSGS)) {
        values = msg.dataDelta[NS_CONVMSGS];
        for (key in values) {
          val = values[key];

          // - process new messages
          // build the representations
          var newMessages = this._transformConvMessages(liveset.blurb,
                                                        key, val, liveset)
                                  .messages;
          var curData = liveset._dataByNS[NS_CONVMSGS][key];
          // notify the liveset and its consumers
          liveset._notifyAndSplice(curData.messages.length, 0, newMessages);
          // update our liveset references so that if a redundant query is
          //  issued the cache gets the right/up-to-date data.
          curData.messages.splice(curData.messages.length, 0, newMessages);

          // - process watermark changes
          // XXX yes, process watermarks.
        }
      }
    }
    // -- Common Case: Apply Splices
    else {
      for (i = 0; i < msg.splices.length; i++) {
        dataMap = liveset._dataByNS[liveset._ns];
        var spliceInfo = msg.splices[i];
        var objItems = [];
        for (var iName = 0; iName < spliceInfo.items.length; iName++) {
          objItems.push(dataMap[spliceInfo.items[iName]]);
        }
        liveset._notifyAndSplice(spliceInfo.index, spliceInfo.howMany,
                                 objItems);
      }
    }
    liveset._notifyCompleted();
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
  _transformPeepBlurb: function(localName, data, /* unused */ liveset) {
    return new PeepBlurb(this, localName, data.ourPoco, data.selfPoco,
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
  _transformConvBlurb: function(localName, wireConv, liveset) {
    var participants = [];
    for (var i = 0; i < wireConv.participants.length; i++) {
      participants.push(liveset._dataByNS.peeps[wireConv.participants[i]]);
    }
    var blurb = new ConversationBlurb(
      this, localName, participants, wireConv.pinned, wireConv.numUnread
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
  _transformConvMessages: function(blurb, localName, wireConv, liveset) {
    var messages = [];
    for (var iMsg = 0; iMsg < wireConv.messages.length; iMsg++) {
      messages.push(
        this._transformMessage(wireConv.messages[iMsg], blurb, liveset));
    }
    return {
      messages: messages,
    };
  },



  //////////////////////////////////////////////////////////////////////////////
  // Data Queries

  /**
   * Get info on the user. If the user does not exist, the callback will
   * be given a null answer.
   * @args[
   *   @param[listener @dict[
   *     @key[onComplete Function]{
   *       Function called when identity is retrieved.
   *     }
   *   ]
   * ]
   */
  whoAmI: function(listener) {
    if (!this._ourUser) {
      this._ourUser = new OurUserAccount(this, null);
    }
    if (listener)
      this._ourUser._pendingListeners.push(listener);
    this._send('whoAmI', null, null);
    return this._ourUser;
  },

  queryServers: function(listener, data) {
    var handle = this._nextHandle++;
    var query = {};
    var liveset = new LiveOrderedSet(this, handle, NS_SERVERS, query, listener,
                                     data);
    this._handleMap[handle] = liveset;
    this._sets.push(liveset);
    this._send('queryServers', handle, query);
    return liveset;
  },

  createIdentity: function (name, assertion, listener) {
    setTimeout(function () {
      listener.onCompleted(null);
    }, 15);
  },

  useServer: function (id, listener) {
    setTimeout(function () {
      listener.onCompleted(null);
    }, 15);
  },

  /**
   * Issue a live query on a (sub)set of peeps.  We care about changes to the
   *  peeps in the set after we return it, plus changes to the membership of
   *  the set.
   *
   * @args[
   *   @param[query @dict[
   *     @key[by @oneof['alphabet' 'any' 'recip' 'write']]
   *     @key[filter @oneof[null 'pinned']]
   *   ]
   * ]
   */
  queryPeeps: function(query, listener, data) {
    var handle = this._nextHandle++;
    var liveset = new LiveOrderedSet(this, handle, NS_PEEPS, query, listener,
                                     data);
    this._handleMap[handle] = liveset;
    this._sets.push(liveset);
    this._send('queryPeeps', handle, query);
    return liveset;
  },

  queryPeepConversations: function(peep, query, listener, data) {
    var handle = this._nextHandle++;
    var liveset = new LiveOrderedSet(this, handle, NS_CONVBLURBS, query,
                                     listener, data);
    this._handleMap[handle] = liveset;
    this._sets.push(liveset);
    this._send('queryPeeps', handle, {peep: peep._id, query: query});
    return liveset;
  },

  /**
   * Issue a query for the messages in a conversation already know by its blurb.
   */
  queryConversationMessages: function(convBlurb, listener) {
    var handle = this._nextHandle++;
    // passing null for the query def because there is nothing useful we can
    //  track on this side.
    var liveset = new LiveOrderedSet(this, handle, NS_CONVMSGS, null, listener,
                                     data);
    // Save off the blurb for convenience and for direct access by message
    //  processing.  The other side will make sure to loop the blurb into the
    //  query's dependencies for GC et al.
    liveset.blurb = convBlurb;
    this._handleMap[handle] = liveset;
    this._sets.push(liveset);
    this._send('queryConvMsgs', handle, {
      localName: convBlurb._localName,
    });
    return liveset;
  },

  queryAllConversations: function(query, listener) {
  },

  killQuery: function(liveSet) {
    // only send the notification once
    if (liveSet._handle) {
      var idxSet = this._sets.indexOf(liveSet);
      this._sets.splice(idxSet, 1);
      delete this._handleMap[liveSet._handle];

      this._send('killQuery', liveSet._handle, null);
      liveSet._handle = null;
    }
  },

  //////////////////////////////////////////////////////////////////////////////
  // Actions

  /**
   * Connect to a peep we already know about somehow.  Likely sources include:
   *  conversation participant we did not invite, request, some kind of search
   *  mechanism that surfaces peeps somehow.
   */
  connectToPeep: function(peep) {
  },

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
   * Create a new conversation.
   * XXX eventually we want to be able to return a blurb directly, but that
   *  needs to wait until we have the rest of the conversation queries dealt
   *  with.  We will need to locally (on this side) allocate a name, and then
   *  depend on the other side to create the full name, allocate us a local
   *  name to correspond it, and send the local name back to us.  Rawclient
   *  may also need to grow an immediate representation.
   *
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
      peeps: this._normalizeObjsToLocalNames(args.peeps),
      messageText: args.text,
    };
    this._send('createConversation', null, outArgs);
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
