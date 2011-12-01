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
      NS_SERVERS = 'servers',
      NS_POSSFRIENDS = 'possfriends',
      NS_CONNREQS = 'connreqs',
      NS_ERRORS = 'errors';

function itemOnImpl(event, listener) {
  var map = this._eventMap;
  if (!map)
    map = this._eventMap = { change: null, remove: null, reorder: null };
  // flag that we now have listeners on individual items
  this._liveset._itemsHaveListeners = true;

  // attempting to get fast shape hits here, likely ridiculous
  switch(event) {
    case 'change':
      map.change = listener;
      break;
    case 'remove':
      map.remove = listener;
      break;
    case 'reorder':
      map.reorder = listener;
      break;
    default:
      throw new Error("Unsupported event type: '" + event + "'");
  }
}

/**
 * Provides summary information about the peep's activities as they relate to
 *  our user: # of unread messages from the user, # of conversations involving
 *  the user, meta-data our user has annotated them with (ex: pinned).
 */
function PeepBlurb(_liveset, _localName, ourPoco, selfPoco,
                   numUnread, numConvs, pinned, isMe) {
  this._eventMap = null;
  this._liveset = _liveset;
  this._localName = _localName;
  this.ourPoco = ourPoco;
  this.selfPoco = selfPoco;
  this._numUnread = numUnread;
  this._numConvs = numConvs;
  this._pinned = pinned;
  this._isMe = isMe;
  this.data = null;
}
PeepBlurb.prototype = {
  __namespace: 'peeps',
  __clone: function(liveset, cloneHelper) {
    return new PeepBlurb(liveset, this._localName, this.ourPoco, this.selfPoco,
                         this._numUnread, this._numConvs, this._pinned,
                         this._isMe);
  },

  get id() {
    return this._localName;
  },

  // -- getters exist so writes loudly fail
  get isContact() {
    return this.ourPoco !== null;
  },

  get isMe() {
    return this._isMe;
  },

  get pinned() {
    return this._pinned;
  },

  get displayName() {
    if (this.ourPoco && this.ourPoco.displayName)
      return this.ourPoco.displayName;
    return "Alleged " + this.selfPoco.displayName;
  },

  get numInvolvedConversations() {
    return this._numConvs;
  },

  get numUnreadAuthoredMessages() {
    return this._numUnread;
  },

  get pic() {
    // XXX we currently have no upstream validation of these values, but that
    //  is where we want it to happen.  The pictures should be data URLs.
    if (this.ourPoco && this.ourPoco.hasOwnProperty('photos'))
      return this.ourPoco.photos[0].value;
    if (this.selfPoco.hasOwnProperty('photos'))
      return this.selfPoco.photos[0].value;
    return null;
  },

  on: itemOnImpl,
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
  __clone: function(owner, cloneHelper) {
    return new JoinMessage(
      owner, cloneHelper(this.inviter), cloneHelper(this.invitee),
      this.receivedAt);
  },
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
  __clone: function(owner, cloneHelper) {
    return new HumanMessage(
      owner, cloneHelper(this.author),
      this.composedAt, this.receivedAt, this.text);
  },

  markAsLastSeenMessage: function() {
  },

  markAsLastReadMessage: function() {
  },
};

/**
 * Provides summary information about a conversation: its participants, initial
 *  message text, most recent activity, # of unread messages.
 */
function ConversationBlurb(_liveset, _localName, participants,
                           pinned, numUnread) {
  this._eventMap = null;
  this._liveset = _liveset;
  this._localName = _localName;
  this.participants = participants;
  // the messages have a reference to us and so cannot be created yet
  this.firstMessage = null;
  this.firstUnreadMessage = null;
  this._pinned = pinned;
  this._numUnread = numUnread;
}
ConversationBlurb.prototype = {
  __namespace: 'convblurbs',
  __clone: function(liveset, cloneHelper) {
    var clone = new ConversationBlurb(
      liveset, this._localName, this.participants.map(cloneHelper),
      this._pinned, this._numUnread);
    if (this.firstMessage)
      clone.firstMessage = this.firstMessage.__clone(clone, cloneHelper);
    if (this.firstUnreadMessage)
      clone.firstUnreadMessage = this.firstUnreadMessage.__clone(clone,
                                                                 cloneHelper);
    return clone;
  },

  get id() {
    return this._localName;
  },

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
    this._liveset._bridge._send('replyToConv', this._localName, msgData);
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
    this._liveset._bridge._send('inviteToConv', this._localName, invData);
  },

  on: itemOnImpl,
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
    possfriends: {},
    connreqs: {},
    errors: {},
  };
  this.query = query;
  this.items = [];
  this.completed = false;
  this._listener = listener;
  this._itemsHaveListeners = false;
  this._eventMap = { add: null, complete: null, remove: null, reorder: null };
  this.data = data;
}
LiveOrderedSet.prototype = {
  on: function(event, listener) {
    var listeners;
    switch (event) {
      case 'add':
      case 'complete':
      case 'remove':
      case 'reorder':
        this._eventMap[event] = listener;
        break;
      default:
        throw new Error("Unsupported event type: '" + event + "'");
    }
  },

  /**
   * Clone some subset of items in this set into a new `LiveOrderedSet`.  The
   *  resulting set will only receive updates about the explicitly sliced items
   *  and will not receive notifications about new items, reordered items, etc.
   *  Because new clones of the items and all of their referenced objects will
   *  be created, the user of the new set should acquire (new) references to
   *  the (new) objects.
   *
   * This is an expert-only API because there is currently a race window as
   *  implemented.  The cloned query will not be properly subscribed for updates
   *  until the backside receives our notification about the clone.  From our
   *  perspective, this means that everything the bridge hears about the source
   *  query between the time this API call is invoked and the 'cloneQueryAck'
   *  message is received will not be reflected in the cloned query.  This could
   *  be addressed by applying all updates for the source query until the ack
   *  is received (without throwing errors about missing things that were
   *  likely filtered out), but that is deemed surplus to needs given current
   *  levels of laziness.
   */
  cloneSlice: function(items, data) {
    var cloneSet = new LiveOrderedSet(this._bridge, this._bridge._nextHandle++,
                                      this._ns, 'CLONE', data),
        cloneMap = cloneSet._dataByNS[this._ns];
    this._bridge._handleMap[cloneSet._handle] = cloneSet;
    this._bridge._sets.push(cloneSet);

    function cloneHelper(item) {
      var nsMap = cloneSet._dataByNS[item.__namespace],
          localName = item._localName;
      // if we already have a version specialized for this set, return it
      if (nsMap.hasOwnProperty(localName))
        return nsMap[localName];
      // otherwise, we need to perform a clone and stash the result
      return (nsMap[localName] = item.__clone(cloneSet, cloneHelper));
    }

    var slicedLocalNames = [];
    for (var i = 0; i < items.length; i++) {
      var srcItem = items[i];
      slicedLocalNames.push(srcItem._localName);

      var clonedItem = srcItem.__clone(cloneSet, cloneHelper);
      cloneSet.items.push(clonedItem);
      cloneMap[clonedItem._localName] = clonedItem;
    }

    this._bridge._send(
      'cloneQuery', cloneSet._handle,
      {
        ns: this._ns,
        source: this._handle,
        sliced: slicedLocalNames,
      });

    return cloneSet;
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
   *
   * @args[
   *   @param[modifiedPrimaries]{
   *     The list of modified items that are part of the namespace this query
   *     is on.  So if it's a peeps query, peeps end up in here.  If it was a
   *     query on conversations, then the peeps would end up in `modifiedDeps`
   *     instead.
   *   }
   *   @param[modifiedDeps]{
   *     The list of modified items that are referenced by the items that are
   *     part of the primary namespace.  For example, if a `PeepBlurb` is
   *     named by a conversation query and it changes, it goes in this list.
   *   }
   * ]
   */
  _notifyCompleted: function(added, addedAtIndex, moved, movedToIndex, removed,
                             modifiedPrimaries, modifiedDeps) {
    var i, item;
try {
    if (this._eventMap.add && added.length) {
      var addCall = this._eventMap.add;
      for (i = 0; i < added.length; i++) {
        addCall(added[i], addedAtIndex[i], this);
      }
    }
    if (this._eventMap.reorder && moved.length) {
      var moveCall = this._eventMap.reorder;
      for (i = 0; i < moved.length; i++) {
        moveCall(moved[i], movedToIndex[i], this);
      }
    }
    if (this._eventMap.remove && removed.length) {
      var removeCall = this._eventMap.remove;
      for (i = 0; i < removed.length; i++) {
        removeCall(removed[i], this);
      }
    }
    if (this._itemsHaveListeners) {
      var itemEvents;
      for (i = 0; i < moved.length; i++) {
        item = moved[i];
        itemEvents = item._eventMap;
        if (itemEvents && itemEvents.reorder)
          itemEvents.reorder(item, movedToIndex[i], this);
      }
      for (i = 0; i < modifiedPrimaries.length; i++) {
        item = modifiedPrimaries[i];
        itemEvents = item._eventMap;
        if (itemEvents && itemEvents.change)
          itemEvents.change(item, this);
      }
      for (i = 0; i < modifiedDeps.length; i++) {
        item = modifiedDeps[i];
        itemEvents = item._eventMap;
        if (itemEvents && itemEvents.change)
          itemEvents.change(item, this);
      }
      for (i = 0; i < removed.length; i++) {
        item = removed[i];
        itemEvents = item._eventMap;
        if (itemEvents && itemEvents.remove)
          itemEvents.remove(item, this);
      }
    }

    this.completed = true;
    if (this._listener && this._listener.onCompleted)
      this._listener.onCompleted(this, modifiedPrimaries, modifiedDeps);
    if (this._eventMap.complete)
      this._eventMap.complete(this);
} catch(ex) { console.error("problem during _notifyCompleted:", ex); }
  },

  /**
   * Closes the query so that we no longer receive updates about the query.
   *  Once this is invoked, the reference to the set and all of its contents
   *  should be dropped as they will no longer be valid or kept up-to-date.
   */
  destroy: function() {
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
function ServerInfo(_liveset, _localName, url, displayName) {
  this._eventMap = null;
  this._liveset = _liveset,
  this._localName = _localName;
  this.url = url;
  this.displayName = displayName;
}
ServerInfo.prototype = {
  __namespace: 'servers',
  __clone: function(liveset, cloneHelper) {
    return new ServerInfo(liveset, this._localName, this.url, this.displayName);
  },

  get id() {
    return this._localName;
  },

  on: itemOnImpl,
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
   * The crypto self-ident blob for the user.  This is being introduced to
   *  allow the selenium webdriver-based testing framework to extract the
   *  public keys of the user in a reasonably clean fashion.
   */
  this.selfIdentBlob = null;
  /**
   * The public key for this client.  Also being introduced for unit tests.
   */
  this.clientPublicKey = null;

  /**
   * Callers who have invoked `whoAmI` but not gotten an onCompleted callback
   *  yet.
   */
  this._pendingListeners = [];
  this._signupListener = null;
}
OurUserAccount.prototype = {
  /**
   * Has the user configured their identity at all/enough?
   */
  get havePersonalInfo() {
    return this.poco && !!this.poco.displayName;
  },

  /**
   * Does the user have an established account with a server?
   */
  get haveServerAccount() {
    return !!this.usingServer;
  },

  /**
   * Replace the current poco with a new set of detail.  Success is assumed.
   */
  updatePersonalInfo: function(newPoco) {
    this._bridge._send('updatePoco', null, newPoco);
  },

  /**
   * Speculative call to let the UI provide a BrowserID attestation or other
   *  third-party attestation of the user's identity.
   */
  provideProofOfIdentity: function(proof) {
    this._bridge._send('provideProofOfIdentity', null, proof);
  },

  signupWithServer: function(serverInfo, signupListener) {
    if (this.usingServer)
      throw new Error("Already signed up with a server!");

    this._signupListener = signupListener;
    this._bridge._send('signup', null, serverInfo._localName);
  },
};

/**
 * An attempt to establish a contact relationship with our user by someone.
 *  This includes how that person identifies themself represented as a
 *  `PeepBlurb`, when the request was received by our transit server, how they
 *  are identifying us, and an optional message text sent with their request.
 *
 * In the future, we may also include extra information like conversations we
 *  are already involved in with the person, existing contacts who have
 *  indicated a contact relationship with the person via conversation joins
 *  or other mechanisms, etc.
 *
 * Note that `theirPocoForUs` is not guaranteed to be the poco for us they will
 *  use when inviting us to join conversations.  They could call us "the king"
 *  in the connect request but call us "the king's fool" when inviting us to
 *  join conversations.
 */
function ConnectRequest(_liveset, localName, peep, serverInfo, theirPocoForUs,
                        receivedAt, messageText) {
  this._eventMap = null;
  this._liveset = _liveset;
  this._localName = localName;
  this.peep = peep;
  this.peepServer = serverInfo;
  this.theirPocoForUs = theirPocoForUs;
  this.receivedAt = new Date(receivedAt);
  this.messageText = messageText;
}
ConnectRequest.prototype = {
  __namespace: 'connreqs',
  __clone: function(liveset, cloneHelper) {
    return new ConnectRequest(
      liveset, this._localName, cloneHelper(this.peep),
      cloneHelper(this.peepServer), this.theirPocoForUs,
      this.receivedAt, this.messageText);
  },

  get id() {
    return this._localName;
  },

  /**
   * Accept this connection request, providing a portable contacts
   *  representation that we will include in our assertion of this person's
   *  identity.
   */
  acceptConnectRequest: function(ourPocoForThem) {
    this._liveset._bridge.connectToPeep(this.peep, ourPocoForThem);
  },


  /**
   * Reject this connection request permanently, removing it from the connect
   *  request list and never allowing any new requests to be issued by this
   *  person.  If you simply want to ignore a request, then don't call any
   *  methods.
   */
  rejectConnectRequest: function() {
    this._liveset._bridge._send('rejectConnectRequest', null,
      { localName: this._localName, reportAs: null });
  },

  on: itemOnImpl,
};

/**
 * Represents a possible friend with a rationale of why that person is a
 *  candidate and perhaps how good a candidate they are.
 */
function PossibleFriend(_liveset, localName, peep) {
  this._eventMap = null;
  this._liveset = _liveset;
  this._localName = localName;
  this.peep = peep;
}
PossibleFriend.prototype = {
  __namespace: 'possfriends',
  __clone: function(liveset, cloneHelper) {
    return new PossibleFriend(
      liveset, this._localName, cloneHelper(this.peep));
  },

  on: itemOnImpl,
};

////////////////////////////////////////////////////////////////////////////////
// Error Representations

function ErrorRep(errorId, errorParam, firstReported, lastReported, count,
                  userActionRequired, permanent) {
  this.errorId = errorId;
  this.errorParam = errorParam;
  this.firstReported = new Date(firstReported);
  this.lastReported = new Date(lastReported);
  this.count = count;
  this.userActionRequired = userActionRequired;
  this.permanent = permanent;
}
ErrorRep.prototype = {
  __namespace: 'errors',
  __clone: function(liveset, cloneHelper) {
    return new ErrorRep(this.errorId, this.errorParam, this.firstReported,
                        this.lastReported, this.count, this.userActionRequired,
                        this.permanent);
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

  this._mootedMessageReceivedListener = null;

  /**
   * Simple event listener map.
   */
  this._listeners = {
    connectionStatusChange: [],
  };

  this.connectionStatus = 'disconnected';
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
    this._sendObjFunc({cmd: cmd, name: thisSideName, payload: payload});
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
   * Receive a message from the other side.
   */
  _receive: function(msg) {
    switch (msg.type) {
      case 'whoAmI':
        return this._receiveWhoAmI(msg);
      case 'signupResult':
        return this._receiveSignupResult(msg);
      case 'query':
        if (msg.op === 'dead')
          throw new Error("Query '" + msg.handle + "' has died; " +
                          "check for loggest errors.");
        return this._receiveQueryUpdate(msg);
      case 'cloneQueryAck':
        return this._receiveCloneQueryAck(msg);

      case 'connectionStatus':
        this.connectionStatus = msg.status;
        return this._fireEvent('connectionStatusChange', msg.status);
    }
    throw new Error("Received unknown message type: " + msg.type);
  },

  _fireEvent: function(name, arg) {
    var listeners = this._listeners[name];
    for (var i = 0; i < listeners.length; i++) {
      listeners[i](arg);
    }
  },

  _transformServerInfo: function(_liveset, _localName, serialized) {
    if (!serialized)
      return null;
    return new ServerInfo(_liveset, _localName,
                          serialized.url, serialized.displayName);
  },

  _receiveWhoAmI: function(msg) {
    // update the representation
    this._ourUser.poco = msg.poco;
    this._ourUser.selfIdentBlob = msg.selfIdentBlob;
    this._ourUser.clientPublicKey = msg.clientPublicKey;
    // We are passing an empty obj to masquerade as the owning liveset to stop
    //  the 'on' method from breaking if it gets used.  There are no events
    //  associated with this rep, so it should ideally be fine...
    this._ourUser.usingServer = this._transformServerInfo({}, null,
                                                          msg.server);

    // notify listeners
    for (var i = 0; i < this._ourUser._pendingListeners.length; i++) {
      this._ourUser._pendingListeners[i].onCompleted(this._ourUser);
    }
    this._ourUser._pendingListeners = [];
  },

  _receiveSignupResult: function(msg) {
    if (this._ourUser._signupListener) {
      try {
        this._ourUser._signupListener.onCompleted(msg.err);
      }
      catch(ex) {
        console.error("Exception in signup completion handler:", ex);
      }
      this._ourUser._signupListener = null;
    }
  },

  /**
   *
   */
  _receiveCloneQueryAck: function(msg) {
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
      if (this._mootedMessageReceivedListener)
        this._mootedMessageReceivedListener(msg);
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
    var i, key, attr, values, val, dataMap, curRep, delta;

    // Track the modified objects be binned into either modified primary objects
    //  or modified dependent objects.  This differentiation may only be
    //  relevant to unit testing...
    var modifiedPrimaries = [], modifiedDeps = [], useModified = null;

    // -- Servers
    if (msg.dataMap.hasOwnProperty(NS_SERVERS)) {
      values = msg.dataMap[NS_SERVERS];
      dataMap = liveset._dataByNS[NS_SERVERS];
      for (key in values) {
        val = values[key];
        // null (in the non-delta case) means pull it from cache
        if (val === null)
          dataMap[key] = this._cacheLookupOrExplode(liveset, NS_SERVERS, key);
        else
          dataMap[key] = this._transformServerInfo(liveset, key, val);
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
          dataMap[key] = this._cacheLookupOrExplode(liveset, NS_PEEPS, key);
        else
          dataMap[key] = this._transformPeepBlurb(key, val, liveset);
      }
    }
    if (msg.dataDelta.hasOwnProperty(NS_PEEPS)) {
      values = msg.dataDelta[NS_PEEPS];
      dataMap = liveset._dataByNS[NS_PEEPS];
      useModified = (liveset._ns === NS_PEEPS) ? modifiedPrimaries
                                               : modifiedDeps;
      for (key in values) {
        if (!dataMap.hasOwnProperty(key))
          throw new Error("dataDelta for unknown key: " + key);
        delta = values[key];
        if (delta === null) {
          delete dataMap[key];
          continue;
        }
        curRep = dataMap[key];
        for (attr in delta) {
          switch (attr) {
            case 'numConvs':
              curRep._numConvs = delta.numConvs;
              break;
            case 'ourPoco':
              curRep.ourPoco = delta.ourPoco;
              break;
          }
        }
        useModified.push(curRep);
      }
    }

    // -- Conv Blurbs
    if (msg.dataMap.hasOwnProperty(NS_CONVBLURBS)) {
      values = msg.dataMap[NS_CONVBLURBS];
      dataMap = liveset._dataByNS[NS_CONVBLURBS];
      for (key in values) {
        val = values[key];
        // null (in the non-delta case) means pull it from cache
        if (val === null)
          dataMap[key] = this._cacheLookupOrExplode(liveset, NS_CONVBLURBS, key);
        else
          dataMap[key] = this._transformConvBlurb(key, val, liveset);
      }
    }
    if (msg.dataDelta.hasOwnProperty(NS_CONVBLURBS)) {
      values = msg.dataDelta[NS_CONVBLURBS];
      dataMap = liveset._dataByNS[NS_CONVBLURBS];
      useModified = (liveset._ns === NS_CONVBLURBS) ? modifiedPrimaries
                                                    : modifiedDeps;
      for (key in values) {
        if (!dataMap.hasOwnProperty(key))
          throw new Error("dataDelta for unknown key: " + key);
        delta = values[key];
        if (delta === null) {
          delete dataMap[key];
          continue;
        }
        curRep = dataMap[key];
        for (attr in delta) {
          switch (attr) {
            case 'participants':
              for (i = 0; i < delta.participants.length; i++) {
                // to make this idempotent in the face of our redundant updates
                //  we need to check to make sure we didn't already add them.
                var participant =
                  liveset._dataByNS.peeps[delta.participants[i]];
                if (curRep.participants.indexOf(participant) === -1)
                  curRep.participants.push(participant);
              }
              break;
            case 'firstMessage':
              // only use it if we don't already have one
              if (!curRep.firstMessage)
                curRep.firstMessage = this._transformMessage(delta.firstMessage,
                                                             curRep, liveset);
              break;
          }
        }
        useModified.push(curRep);
      }
    }

    if (msg.dataMap.hasOwnProperty(NS_POSSFRIENDS)) {
      values = msg.dataMap[NS_POSSFRIENDS];
      dataMap = liveset._dataByNS[NS_POSSFRIENDS];
      for (key in values) {
        val = values[key];
        // null (in the non-delta case) means pull it from cache
        if (val === null)
          dataMap[key] = this._cacheLookupOrExplode(liveset, NS_POSSFRIENDS,
                                                    key);
        else
          dataMap[key] = this._transformPossibleFriend(key, val, liveset);
      }
    }
    if (msg.dataDelta.hasOwnProperty(NS_POSSFRIENDS)) {
      values = msg.dataDelta[NS_POSSFRIENDS];
      dataMap = liveset._dataByNS[NS_POSSFRIENDS];
      for (key in values) {
        if (!dataMap.hasOwnProperty(key))
          throw new Error("dataDelta for unknown key: " + key);
        delta = values[key];
        if (delta === null) {
          delete dataMap[key];
          continue;
        }
      }
    }

    if (msg.dataMap.hasOwnProperty(NS_CONNREQS)) {
      values = msg.dataMap[NS_CONNREQS];
      dataMap = liveset._dataByNS[NS_CONNREQS];
      for (key in values) {
        val = values[key];
        // null (in the non-delta case) means pull it from cache
        if (val === null)
          dataMap[key] = this._cacheLookupOrExplode(liveset, NS_CONNREQS, key);
        else
          dataMap[key] = this._transformConnectRequest(key, val, liveset);
      }
    }
    if (msg.dataDelta.hasOwnProperty(NS_CONNREQS)) {
      values = msg.dataDelta[NS_CONNREQS];
      dataMap = liveset._dataByNS[NS_CONNREQS];
      for (key in values) {
        if (!dataMap.hasOwnProperty(key))
          throw new Error("dataDelta for unknown key: " + key);
        delta = values[key];
        if (delta === null) {
          delete dataMap[key];
          continue;
        }
      }
    }

    if (msg.dataMap.hasOwnProperty(NS_ERRORS)) {
      values = msg.dataMap[NS_ERRORS];
      dataMap = liveset._dataByNS[NS_ERRORS];
      for (key in values) {
        val = values[key];
        // null (in the non-delta case) means pull it from cache
        if (val === null)
          dataMap[key] = this._cacheLookupOrExplode(liveset, NS_ERRORS, key);
        else
          dataMap[key] = this._transformError(key, val, liveset);
      }
    }
    if (msg.dataDelta.hasOwnProperty(NS_ERRORS)) {
      values = msg.dataDelta[NS_ERRORS];
      dataMap = liveset._dataByNS[NS_ERRORS];
      useModified = (liveset._ns === NS_ERRORS) ? modifiedPrimaries
                                                : modifiedDeps;
      for (key in values) {
        if (!dataMap.hasOwnProperty(key))
          throw new Error("dataDelta for unknown key: " + key);
        delta = values[key];
        if (delta === null) {
          delete dataMap[key];
          continue;
        }
        curRep = dataMap[key];

        curRep.lastReported = new Date(delta.lastReported);
        curRep.reportedCount = delta.reportedCount;

        useModified.push(curRep);
      }
    }

    // --- Populate The Set = Apply Splices or Special Case.
    var added = [], addedAtIndex = [], moved = [], movedToIndex = [],
        removed = [];

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
            dataMap[key] = this._cacheLookupOrExplode(liveset, NS_CONVMSGS,
                                                      key);
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
          if (!liveset._dataByNS[NS_CONVMSGS].hasOwnProperty(key))
            throw new Error("liveset lacks data on conv '" + key + "'");
          var curData = liveset._dataByNS[NS_CONVMSGS][key];
          // notify the liveset and its consumers
          liveset._notifyAndSplice(curData.messages.length, 0, newMessages);
          // update our liveset references so that if a redundant query is
          //  issued the cache gets the right/up-to-date data.
          curData.messages.splice.apply(
            curData.messages, [curData.messages.length, 0].concat(newMessages));

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
        var objItems = [], objItem, addIdx, moveIdx, delIdx;
        // - deletion
        if (spliceInfo.howMany) {
          for (var iDel = spliceInfo.index;
               iDel < spliceInfo.index + spliceInfo.howMany;
               iDel++) {
            objItem = liveset.items[iDel];
            if ((addIdx = added.indexOf(objItem)) !== -1) {
              added.splice(addIdx, 1);
              addedAtIndex.splice(addIdx, 1);
            }
            // has it already moved?  move it back to a deletion
            else if ((moveIdx = moved.indexOf(objItem)) !== -1) {
              moved.splice(moveIdx, 1);
              movedToIndex.splice(moveIdx, 1);
              removed.push(objItem);
            }
            // if it wasn't added in this update, then track it as a deletion
            // (added and deleted in a single pass cancels out into nothing)
            else {
              removed.push(objItem);
            }
          }
        }
        // - (optional) addition or the latter half of a move
        if (spliceInfo.items) {
          for (var iName = 0; iName < spliceInfo.items.length; iName++) {
            objItem = dataMap[spliceInfo.items[iName]];
            objItems.push(objItem);
            // turn a removal into a move...
            if ((delIdx = removed.indexOf(objItem)) !== -1) {
              removed.splice(delIdx, 1);
              moved.push(objItem);
              moved.push(iName + spliceInfo.index);
            }
            // otherwise it's an add.
            else {
              added.push(objItem);
              addedAtIndex.push(iName + spliceInfo.index);
            }
          }
        }
        liveset._notifyAndSplice(spliceInfo.index, spliceInfo.howMany,
                                 objItems);
      }
    }
    liveset._notifyCompleted(added, addedAtIndex, moved, movedToIndex, removed,
                             modifiedPrimaries, modifiedDeps);
  },

  /**
   * Look up the associated representation that we know must exist somewhere
   *  and clone it into existence for the target `liveset`.
   *
   * This is intended to be used when the backside knows we already have
   *  information on an object and it can avoid sending us duplicate data.
   *  In such a case, the backside will only tell us about the primary object
   *  and will not bother to send nulls across for dependent objects.
   *
   * @args[
   *   @param[liveset LiveOrderedSet]{
   *     The target liveset the object will be inserted into.  The caller
   *     is responsible for taking this action.
   *   }
   * ]
   */
  _cacheLookupOrExplode: function(liveset, ns, localName) {
    // helper to clone the given item
    function cloneHelper(item) {
      var nsMap = liveset._dataByNS[item.__namespace],
          localName = item._localName;
      // if we already have a version specialized for this set, return it
      if (nsMap.hasOwnProperty(localName))
        return nsMap[localName];
      // otherwise, we need to perform a clone and stash the result
      return (nsMap[localName] = item.__clone(liveset, cloneHelper));
    }

    var sets = this._sets;
    for (var iSet = 0; iSet < sets.length; iSet++) {
      var lset = sets[iSet];
      var nsMap = lset._dataByNS[ns];
      if (nsMap.hasOwnProperty(localName))
        return nsMap[localName].__clone(liveset, cloneHelper);
    }
    throw new Error("No such entry in namespace '" + ns + "' with name '" +
                    localName + "'");
  },

  /**
   * Create a `PeepBlurb` representation from the wire rep.
   */
  _transformPeepBlurb: function(localName, data, liveset) {
    return new PeepBlurb(liveset, localName, data.ourPoco, data.selfPoco,
                         data.numUnread, data.numConvs, data.pinned,
                         data.isMe);
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
      liveset, localName, participants, wireConv.pinned, wireConv.numUnread
    );
    blurb.firstMessage = wireConv.firstMessage &&
      this._transformMessage(wireConv.firstMessage, blurb, liveset);
    blurb.firstUnreadMessage = wireConv.firstUnreadMessage &&
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

  _transformPossibleFriend: function(localName, wireRep, liveset) {
    var peepRep = liveset._dataByNS.peeps[wireRep.peepLocalName];
    return new PossibleFriend(liveset, localName, peepRep);
  },

  /**
   * Create a `ConnectRequest` representation from the wire rep.
   */
  _transformConnectRequest: function(localName, wireRep, liveset) {
    var peepRep = liveset._dataByNS.peeps[wireRep.peepLocalName];
    var serverRep = liveset._dataByNS.servers[wireRep.serverLocalName];
    return new ConnectRequest(liveset, localName, peepRep, serverRep,
      wireRep.theirPocoForUs, wireRep.receivedAt, wireRep.messageText);
  },

  /**
   * Create an `ErrorRep` from the wire rep.
   */
  _transformError: function(localName, wireRep, liveset) {
    return new ErrorRep(
      wireRep.errorId, wireRep.errorParam,
      wireRep.firstReported, wireRep.lastReported,
      wireRep.reportedCount,
      wireRep.userActionRequired, wireRep.permanent);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Simple Event Logic

  on: function(name, callback) {
    this._listeners[name].push(callback);
  },

  removeListener: function(name, callback) {
    var handlers = this._listeners[name];
    var index = handlers.indexOf(callback);
    if (index !== -1)
      handlers.splice(index, 1);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Data Queries

  /**
   * Asynchronously retrieve information about our user.  The callback will be
   *  invoked when the update is received.
   *
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

  /**
   * Ask for a list of well-know/trusted servers we can sign up with.
   */
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

  insecurelyQueryServerUsingDomainName: function(domain, listener, data) {
    var handle = this._nextHandle++;
    var query = { domain: domain };
    var liveset = new LiveOrderedSet(this, handle, NS_SERVERS, query, listener,
                                     data);
    this._handleMap[handle] = liveset;
    this._sets.push(liveset);
    this._send('insecureServerDomainQuery', handle, query);
    return liveset;
  },

  /**
   * Ask all the servers known to our client/server for the list of their users
   *  who are willing to be known to us.  Presumably they told their server it
   *  was okay to let it be known to the public or some friend-graph thing was
   *  satisfied.
   */
  queryPossibleFriends: function(listener, data) {
    var handle = this._nextHandle++;
    var query = {};
    var liveset = new LiveOrderedSet(this, handle, NS_POSSFRIENDS, query,
                                     listener, data);
    this._handleMap[handle] = liveset;
    this._sets.push(liveset);
    this._send('queryPossibleFriends', handle, query);
    return liveset;
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
    this._send('queryPeepConversations', handle,
               { peep: peep._localName, query: query });
    return liveset;
  },

  /**
   * Issue a query for the messages in a conversation already know by its blurb.
   */
  queryConversationMessages: function(convBlurb, listener, data) {
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

  queryAllConversations: function(query, listener, data) {
  },

  queryConnectRequests: function(listener, data) {
    var handle = this._nextHandle++;
    // passing null for the query def because there is nothing useful we can
    //  track on this side.
    var liveset = new LiveOrderedSet(this, handle, NS_CONNREQS, null, listener,
                                     data);
    this._handleMap[handle] = liveset;
    this._sets.push(liveset);
    this._send('queryConnRequests', handle);
    return liveset;
  },

  killQuery: function(liveSet) {
    // only send the notification once
    if (liveSet._handle) {
      var idxSet = this._sets.indexOf(liveSet);
      this._sets.splice(idxSet, 1);
      delete this._handleMap[liveSet._handle];

      this._send('killQuery', liveSet._handle, liveSet._ns);
      liveSet._handle = null;
    }
  },

  //////////////////////////////////////////////////////////////////////////////
  // Actions

  /**
   * Explicitly request that we connect to the server and automatically attempt
   *  to reconnect if the connection drops.
   */
  connect: function() {
    this._send('connect', null, null);
  },

  /**
   * Explicitly request that we disconnect from the server.  Issuing new
   *  requests that require us to talk to the server will implicitly cause us
   *  to behave as if `connect` was called.
   */
  disconnect: function() {
    this._send('disconnect', null, null);
  },

  /**
   * Connect to a peep we already know about somehow.  Likely sources include:
   *  conversation participant we did not invite, request, some kind of search
   *  mechanism that surfaces peeps somehow.
   */
  connectToPeep: function(peep, localPoco, optionalMessageText) {
    this._send('connectToPeep', null, {
      peepLocalName: peep._localName,
      localPoco: localPoco,
      messageText: optionalMessageText || "",
    });
  },

  /**
   * Connect to a new person using their self-ident blob.  This is being added
   *  for testing reasons right now, but theoretically this might happen on
   *  a desktop via drag-n-drop.
   */
  connectToPeepUsingSelfIdent: function(selfIdentBlob, localPoco,
                                        optionalMessageText) {
    throw new Error("XXX this is currently a lie, but it's not hard to un-lie");
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
  // Error Queries

  /**
   * Query the current set of errors being experienced by the client and provide
   *  updates as new errors occur, and existing errors are updated or are
   *  removed because the problem got fixed/went away.
   *
   * XXX not unit tested
   */
  queryErrors: function(listener, data) {
    var handle = this._nextHandle++;
    var query = {};
    var liveset = new LiveOrderedSet(this, handle, NS_ERRORS, query, listener,
                                     data);
    this._handleMap[handle] = liveset;
    this._sets.push(liveset);
    this._send('queryErrors', handle, query);
    return liveset;
  },

  //////////////////////////////////////////////////////////////////////////////
};

}); // end define
