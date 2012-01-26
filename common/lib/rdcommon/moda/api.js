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
      NS_CONVNEW = 'convnew',
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
  __forget: function(forgetHelper) {
  },
  toString: function() {
    return '[PeepBlurb ' + this._localName + ']';
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

function msgCommonMarkAsLastReadMessage() {
  this._liveset._bridge._send(
    'publishConvUserMetaDelta',
    this._liveset.blurb._localName,
    { lastRead: this._localName });
}

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
function JoinMessage(_liveset, _localName, inviter, invitee, receivedAt,
                     mostRecentReadMessageBy) {
  this._eventMap = null;
  this._liveset = _liveset;
  this._localName = _localName;
  this.inviter = inviter;
  this.invitee = invitee;
  this.receivedAt = receivedAt;
  this.mostRecentReadMessageBy = mostRecentReadMessageBy;
}
JoinMessage.prototype = {
  __namespace: 'convmsgs',
  __clone: function(liveset, cloneHelper) {
    return new JoinMessage(
      liveset, this._localName,
      cloneHelper(this.inviter), cloneHelper(this.invitee),
      this.receivedAt);
  },
  __forget: function(forgetHelper) {
    forgetHelper(this.inviter);
    forgetHelper(this.invitee);
  },
  toString: function() {
    return '[JoinMessage ' + this._localName + ']';
  },

  type: 'join',
  markAsLastReadMessage: msgCommonMarkAsLastReadMessage,

  on: itemOnImpl,
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
function HumanMessage(_liveset, _localName, author, composedAt, receivedAt,
                      text, mostRecentReadMessageBy) {
  this._eventMap = null;
  this._liveset = _liveset;
  this._localName = _localName,
  this.author = author;
  this.composedAt = composedAt;
  this.receivedAt = receivedAt;
  this.text = text;
  this.mostRecentReadMessageBy = mostRecentReadMessageBy;
}
HumanMessage.prototype = {
  __namespace: 'convmsgs',
  __clone: function(liveset, cloneHelper) {
    return new HumanMessage(
      liveset, this._localName, cloneHelper(this.author),
      this.composedAt, this.receivedAt, this.text,
      this.mostRecentReadMessageBy.map(cloneHelper));
  },
  __forget: function(forgetHelper) {
    forgetHelper(this.author);
  },
  toString: function() {
    return '[HumanMessage ' + this._localName + ']';
  },

  type: 'message',
  markAsLastReadMessage: msgCommonMarkAsLastReadMessage,

  on: itemOnImpl,
};

/**
 * Provides summary information about a conversation: its participants, initial
 *  message text, most recent activity, # of unread messages.
 */
function ConversationBlurb(_liveset, _localName, participants,
                           pinned, numUnread, mostRecentActivity) {
  this._eventMap = null;
  this._liveset = _liveset;
  this._localName = _localName;
  this.participants = participants;
  // the messages have a reference to us and so cannot be created yet
  this.firstMessage = null;
  this.firstUnreadMessage = null;
  this._pinned = pinned;
  this._numUnread = numUnread;
  this._mostRecentActivity = mostRecentActivity;
}
ConversationBlurb.prototype = {
  __namespace: 'convblurbs',
  __clone: function(liveset, cloneHelper) {
    var clone = new ConversationBlurb(
      liveset, this._localName, this.participants.map(cloneHelper),
      this._pinned, this._numUnread, this._mostRecentActivity);
    clone.firstMessage = cloneHelper(this.firstMessage);
    clone.firstUnreadMessage = cloneHelper(this.firstUnreadMessage);
    return clone;
  },
  __forget: function(forgetHelper) {
    this.participants.map(forgetHelper);
    forgetHelper(this.firstMessage);
    forgetHelper(this.firstUnreadMessage);
  },
  toString: function() {
    return '[ConversationBlurb ' + this._localName + ']';
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
  get mostRecentActivity() {
    return this._mostRecentActivity;
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
  this.query = query;
  this.items = [];
  this.completed = false;
  this._instancesByNS = {
    peeps: {},
    convblurbs: {},
    convmsgs: {},
    servers: {},
    possfriends: {},
    connreqs: {},
    errors: {},
  };
  this._listener = listener;
  this._itemsHaveListeners = false;
  this._eventMap = { add: null, change: null, complete: null, remove: null,
                     reorder: null };
  this.data = data;
}
LiveOrderedSet.prototype = {
  toString: function() {
    return '[LiveOrderedSet ' + this._handle + ']';
  },
  on: function(event, listener) {
    var listeners;
    switch (event) {
      case 'change':
        this._eventMap[event] = listener;
        break;
      case 'add':
      case 'complete':
      case 'remove':
      case 'reorder':
        // promote
        if (this._eventMap[event] === null)
          this._eventMap[event] = [listener];
        else
          this._eventMap[event].push(listener);
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
   */
  cloneSlice: function(items, listener, data) {
    var cloneSet = new LiveOrderedSet(this._bridge, this._bridge._nextHandle++,
                                      items[0].__namespace, 'CLONE', listener,
                                      data);
    this._bridge._handleMap[cloneSet._handle] = cloneSet;
    this._bridge._sets.push(cloneSet);

    var slicedLocalNames = [];
    for (var i = 0; i < items.length; i++) {
      var srcItem = items[i];
      slicedLocalNames.push(srcItem._localName);

      var clonedItem = this._bridge._cloneItemIntoLiveset(cloneSet, srcItem);
      cloneSet.items.push(clonedItem);
    }

    this._bridge._send(
      'cloneQuery', cloneSet._handle,
      {
        ns: cloneSet._ns,
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
  _notifyCompleted: function(added, addedAtIndex, moved, movedToIndex, removed) {
    var i, item, iListener;
    if (this._eventMap.add && added.length) {
      var addCalls = this._eventMap.add;
      for (i = 0; i < added.length; i++) {
        for (iListener = 0; iListener < addCalls.length; iListener++) {
          addCalls[iListener](added[i], addedAtIndex[i], this);
        }
      }
    }
    if (this._eventMap.reorder && moved.length) {
      var moveCalls = this._eventMap.reorder;
      for (i = 0; i < moved.length; i++) {
        for (iListener = 0; iListener < moveCalls.length; iListener++) {
          moveCalls[iListener](moved[i], movedToIndex[i], this);
        }
      }
    }
    if (this._eventMap.remove && removed.length) {
      var removeCalls = this._eventMap.remove;
      for (i = 0; i < removed.length; i++) {
        for (iListener = 0; iListener < removeCalls.length; iListener++) {
          removeCalls[iListener](removed[i], this);
        }
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
      for (i = 0; i < removed.length; i++) {
        item = removed[i];
        itemEvents = item._eventMap;
        if (itemEvents && itemEvents.remove)
          itemEvents.remove(item, this);
      }
    }

    this.completed = true;
    if (this._listener && this._listener.onCompleted)
      this._listener.onCompleted(this);
    if (this._eventMap.complete) {
      var completeCalls = this._eventMap.complete;
      for (iListener = 0; iListener < completeCalls.length; iListener++) {
        completeCalls[iListener](this);
      }
    }
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
  __forget: function(forgetHelper) {
  },
  toString: function() {
    return '[ServerInfo ' + this._localName + ']';
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
  toString: function() {
    return '[OurUserAccount]';
  },

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
  __forget: function(forgetHelper) {
    forgetHelper(this.peep);
    forgetHelper(this.peepServer);
  },
  toString: function() {
    return '[ConnectRequest ' + this._localName + ']';
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
  __forget: function(forgetHelper) {
    forgetHelper(this.peep);
  },
  toString: function() {
    return '[PossibleFriend ' + this._localName + ']';
  },

  get id() {
    return this._localName;
  },

  on: itemOnImpl,
};

////////////////////////////////////////////////////////////////////////////////
// Error Representations

function ErrorRep(_liveset, _localName, errorId, errorParam,
                  firstReported, lastReported, count,
                  userActionRequired, permanent) {
  this._eventMap = null;
  this._liveset = _liveset;
  this._localName = _localName;
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
    return new ErrorRep(liveset, this._localName, this.errorId, this.errorParam,
                        this.firstReported, this.lastReported, this.count,
                        this.userActionRequired, this.permanent);
  },
  __forget: function(forgetHelper) {
  },
  toString: function() {
    return '[ErrorRep ' + this._localName + ']';
  },

  get id() {
    return this._localName;
  },

  on: itemOnImpl,
};

////////////////////////////////////////////////////////////////////////////////
// Notification Representations

function NewConversationActivity(_liveset, _localName,
                                 convBlurb, numNewMessages,
                                 boundedNewMessages) {
  this._eventMap = null;
  this._liveset = _liveset;
  this._localName = _localName;
  this.convBlurb = convBlurb;
  this.numNewMessages = numNewMessages;
  this.authors = null;
  this.newMessages = boundedNewMessages;

  this._deriveAuthors();
}
NewConversationActivity.prototype = {
  __namespace: 'convnew',
  __clone: function(liveset, cloneHelper) {
    return new NewConversationActivity(
      liveset, this._localName, cloneHelper(this.convBlurb),
      this.numNewMessages, this.authors.map(cloneHelper),
      this.newMessages.map(cloneHelper));
  },
  __forget: function(forgetHelper) {
    forgetHelper(this.convBlurb);
    this.authors.map(forgetHelper);
    this.newMessages.map(forgetHelper);
  },
  toString: function() {
    return '[NewConversationActivity ' + this._localName + ']';
  },

  get id() {
    return this._localName;
  },

  on: itemOnImpl,

  _deriveAuthors: function() {
    var authors = this.authors = [];
    for (var i = 0; i < this.newMessages; i++) {
      var msg = this.newMessages[i];
      if (msg.type === 'message') {
        if (authors.indexOf(msg.author) === -1)
          authors.push(msg.author);
      }
      else {
        if (authors.indexOf(msg.inviter) === -1)
          authors.push(msg.inviter);
        if (authors.indexOf(msg.invitee) === -1)
          authors.push(msg.invitee);
      }
    }
  },
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

  /**
   * Per-namespace maps from local names to the list of instances bound to that
   *  local name.  Every liveset gets its own instance for a given local name.
   */
  this._dataByNS = {
    peeps: {},
    convblurbs: {},
    convmsgs: {},
    convnew: {},
    servers: {},
    possfriends: {},
    connreqs: {},
    errors: {},
  };

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

  _transform_servers: function(_localName, serialized, lookup) {
    if (!serialized)
      return null;
    return new ServerInfo(null, _localName,
                          serialized.url, serialized.displayName);
  },

  _receiveWhoAmI: function(msg) {
    // update the representation
    this._ourUser.poco = msg.poco;
    this._ourUser.selfIdentBlob = msg.selfIdentBlob;
    this._ourUser.clientPublicKey = msg.clientPublicKey;
    this._ourUser.usingServer = this._transform_servers(null,
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

  _cloneItemIntoLiveset: function(liveset, thing) {
    var dataByNS = this._dataByNS;
    function cloneHelper(thing) {
      if (!thing)
        return thing;
      var clone = dataByNS[thing.__namespace][thing._localName]
                    .__clone(liveset, cloneHelper);
      var instMap = liveset._instancesByNS[thing.__namespace], instList;
      if (!instMap.hasOwnProperty(thing._localName))
        instList = instMap[thing._localName] = [];
      else
        instList = instMap[thing._localName];
      instList.push(clone);
      return clone;
    }
    return cloneHelper(thing);
  },

  _commonProcess: function(namespace, msg) {
    var values, dataMap, val, key, self = this,
        iSet, liveset, sets = this._sets, instMap, instances, iInst;

    function lookupTemplate(namespace, thing) {
      return self._dataByNS[namespace][thing];
    }

    if (msg.dataMap.hasOwnProperty(namespace)) {
      var transformFunc = this['_transform_' + namespace];
      values = msg.dataMap[namespace];
      dataMap = this._dataByNS[namespace];
      for (key in values) {
        val = values[key];
        dataMap[key] = transformFunc.call(this, key, val, lookupTemplate);
      }
    }
    if (msg.dataDelta.hasOwnProperty(namespace)) {
      var deltaFunc = this['_delta_' + namespace], dataByNS = this._dataByNS;

      // function to provide to delta handlers to indicate a release of a
      //  tracked object.
      function forgetHelper(thing) {
        if (!thing)
          return;
        var instMap = liveset._instancesByNS[thing.__namespace];
        var instList = instMap[thing._localName];
        var idx = instList.indexOf(thing);
        instList.splice(idx, 1);
        if (instList.length === 0)
          delete instMap[thing._localName];
        thing.__forget(forgetHelper);
      }
      function cloneHelper(thing) {
        if (!thing)
          return thing;
        var clone = dataByNS[thing.__namespace][thing._localName]
                      .__clone(liveset, cloneHelper);
        var instMap = liveset._instancesByNS[thing.__namespace], instList;
        if (!instMap.hasOwnProperty(thing._localName))
          instList = instMap[thing._localName] = [];
        else
          instList = instMap[thing._localName];
        instList.push(clone);
        return clone;
      }
      function lookupClone(namespace, thingName) {
        if (thingName == null)
          return thingName;
        var clone = dataByNS[namespace][thingName].__clone(liveset,
                                                           cloneHelper);
        var instMap = liveset._instancesByNS[namespace], instList;
        if (!instMap.hasOwnProperty(thingName))
          instList = instMap[thingName] = [];
        else
          instList = instMap[thingName];
        instList.push(clone);
        return clone;
      }

      values = msg.dataDelta[namespace];
      dataMap = this._dataByNS[namespace];

      for (key in values) {
        if (!dataMap.hasOwnProperty(key))
          throw new Error("dataDelta in '" + namespace + "' for key '" + key
                          + "'");

        var templateRep = dataMap[key];

        var delta = values[key];
        // -- forget handling
        // Forgetting happens when the reference counts maintained by the
        //  `NotificationKing` in the client daemon on our behalf are driven to
        //  zero.  This happens because our queries no longer directly reference
        //  the object nor do their dependent references.
        // We do not need to use the forgetHelper in this case because it is
        //  handled elsewhere.  Direct removals are handled in splice processing
        //  in `_receiveQueryUpdate`, and indirect removals are handled below
        //  in delta processing.  (The forgetting process is recursive and those
        //  are its 'roots'.)
        if (delta === null) {
          // (we generate remove notifications on splice only)

          // - forget about the template instance
          delete dataMap[key];

          // - have all livesets forget about their instances as well
          for (iSet = 0; iSet < sets.length; iSet++) {
            liveset = sets[iSet];
            instMap = liveset._instancesByNS[namespace];

            if (instMap.hasOwnProperty(key))
              delete instMap[key];
          }
          continue;
        }

        // -- update the template rep
        deltaFunc.call(this, templateRep, delta, lookupTemplate, forgetHelper);
        // -- update instances, generate change notifications
        for (iSet = 0; iSet < sets.length; iSet++) {
          liveset = sets[iSet];
          instMap = liveset._instancesByNS[namespace];

          if (instMap.hasOwnProperty(key)) {
            var lsetChangeFunc = liveset._eventMap.change;
            instances = instMap[key];
            for (iInst = 0; iInst < instances.length; iInst++) {
              var inst = instances[iInst];
              // - apply delta
              var explained =
                deltaFunc.call(this, inst, delta, lookupClone, forgetHelper);

              // - generate 'change' notifications
              if (lsetChangeFunc)
                lsetChangeFunc(inst, liveset, explained);

              if (!inst._eventMap)
                continue;
              var changeFunc = inst._eventMap.change;
              if (changeFunc)
                changeFunc(inst, liveset, explained);
            }
          }
        }
      }
    }

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
    var liveset;

    // is there an associated query?
    if (msg.handle !== null) {
      if (!this._handleMap.hasOwnProperty(msg.handle))
        throw new Error("Received notification about unknown handle: " +
                        msg.handle);
      liveset = this._handleMap[msg.handle];
      if (liveset === null) {
        // (otherwise this is a notifcation we no longer care about)
        if (this._mootedMessageReceivedListener)
          this._mootedMessageReceivedListener(msg);
        return;
      }
    }
    // otherwise, this is just deltas without any splices
    else {
      liveset = null;
    }

    // -- Transform data, apply deltas
    // We choose our order so that namespaces are processed only after all their
    //  dependent namespaces are already processed.  This allows the
    //  _transform_* funcs to directly grab references.
    var i, key, attr, values, val, dataMap, curRep, delta;

    // servers have no deps
    this._commonProcess(NS_SERVERS, msg);
    // peeps have no deps
    this._commonProcess(NS_PEEPS, msg);
    // messages depend on peeps
    this._commonProcess(NS_CONVMSGS, msg);
    // conv blurbs depend on messages, peeps
    this._commonProcess(NS_CONVBLURBS, msg);
    // conv activity depends on conv blurbs, messages, peeps
    this._commonProcess(NS_CONVNEW, msg);
    // possible friends depend on peeps
    this._commonProcess(NS_POSSFRIENDS, msg);
    // connection requests depend on peeps
    this._commonProcess(NS_CONNREQS, msg);

    // errors depend on nothing
    this._commonProcess(NS_ERRORS, msg);

    // bail if this was just delta and there are no splices to apply
    if (!liveset)
      return;

    // -- Populate the Set: Apply Splices
    var added = [], addedAtIndex = [], moved = [], movedToIndex = [],
        removed = [], localName, dataByNS = this._dataByNS;
    dataMap = this._dataByNS[liveset._ns];
    var instMap = liveset._instancesByNS[liveset._ns];

    function forgetHelper(thing) {
      if (!thing)
        return;
      var instMap = liveset._instancesByNS[thing.__namespace];
      var instList = instMap[thing._localName];
      // it's possible a refcount nuke is occurring concurrently, in which
      //  case we have no work to do.
      if (!instList)
        return;
      var idx = instList.indexOf(thing);
      instList.splice(idx, 1);
      if (instList.length === 0)
        delete instMap[thing._localName];
      thing.__forget(forgetHelper);
    }
    function cloneHelper(thing) {
      if (!thing)
        return thing;
      var clone = dataByNS[thing.__namespace][thing._localName]
                    .__clone(liveset, cloneHelper);
      var instMap = liveset._instancesByNS[thing.__namespace], instList;
      if (!instMap.hasOwnProperty(thing._localName))
        instList = instMap[thing._localName] = [];
      else
        instList = instMap[thing._localName];
      instList.push(clone);
      return clone;
    }

    for (i = 0; i < msg.splices.length; i++) {
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
          localName = spliceInfo.items[iName];
          // (there should only be one of the instance in the set)
          if (instMap.hasOwnProperty(localName))
            objItem = instMap[localName][0];
          else
            objItem = cloneHelper(dataMap[localName]);
          objItems.push(objItem);
          // XXX these checks can be folded into the above case
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

    // kill off the instance hierarchy for removed items
    for (i = 0; i < removed.length; i++) {
      forgetHelper(removed[i]);
    }
    liveset._notifyCompleted(added, addedAtIndex, moved, movedToIndex, removed);
  },

  /**
   * Create a `PeepBlurb` representation from the wire rep.
   */
  _transform_peeps: function(localName, data) {
    return new PeepBlurb(null, localName, data.ourPoco, data.selfPoco,
                         data.numUnread, data.numConvs, data.pinned,
                         data.isMe);
  },

  _delta_peeps: function(curRep, delta, liveset, forgetHelper) {
    var explainDelta = {
      numConvs: false,
      numUnread: false,
      ourPoco: false,
    };
    for (var attr in delta) {
      switch (attr) {
        case 'numConvs':
          curRep._numConvs = delta.numConvs;
          explainDelta.numConvs = true;
          break;
        case 'numUnread':
          curRep._numUnread = delta.numUnread;
          explainDelta.numUnread = true;
          break;
        case 'ourPoco':
          curRep.ourPoco = delta.ourPoco;
          explainDelta.ourPoco = true;
          break;
      }
    }
    return explainDelta;
  },

  /**
   * Create a `ConversationBlurb` representation from the wire rep.
   */
  _transform_convblurbs: function(localName, wireConv) {
    var participants = [];
    for (var i = 0; i < wireConv.participants.length; i++) {
      participants.push(this._dataByNS.peeps[wireConv.participants[i]]);
    }
    var blurb = new ConversationBlurb(
      null, localName, participants, wireConv.pinned, wireConv.numUnread,
      new Date(wireConv.mostRecentActivity));
    if (wireConv.firstMessage)
      blurb.firstMessage = this._dataByNS[NS_CONVMSGS][wireConv.firstMessage];
    if (wireConv.firstUnreadMessage)
      blurb.firstUnreadMessage =
        this._dataByNS[NS_CONVMSGS][wireConv.firstUnreadMessage];

    return blurb;
  },

  _delta_convblurbs: function(curRep, delta, lookupClone, forgetHelper) {
    var i, idx, peep;
    var explainDelta = {
      numUnread: false,
      participants: false,
      firstMessage: false,
      firstUnreadMessage: false,
      mostRecentActivity: false,
    };
    for (var attr in delta) {
      switch (attr) {
        case 'numUnread':
          curRep._numUnread = delta.numUnread;
          explainDelta.numUnread = true;
          break;
        case 'participants':
          explainDelta.participants = [];
          for (i = 0; i < delta.participants.length; i++) {
            peep = lookupClone(NS_PEEPS, delta.participants[i]);
            curRep.participants.push(peep);
            explainDelta.participants.push(peep);
          }
          break;
        case 'firstMessage':
          curRep.firstMessage = lookupClone(NS_CONVMSGS, delta.firstMessage);
          explainDelta.firstMessage = true;
          break;
        case 'firstUnreadMessage':
          if (delta.firstUnreadMessage)
            curRep.firstUnreadMessage = lookupClone(NS_CONVMSGS,
                                                    delta.firstUnreadMessage);
          else
            curRep.firstUnreadMessage = null;
          explainDelta.firstUnreadMessage = true;
          break;
        case 'mostRecentActivity':
          curRep._mostRecentActivity = new Date(delta.mostRecentActivity);
          explainDelta.mostRecentActivity = true;
          break;
      }
    }
    return explainDelta;
  },

  _transform_convmsgs: function(localName, msg) {
    var mostRecentReadMessageBy = [];
    if (msg.mark) {
      for (var i = 0; i < msg.mark.length; i++) {
        mostRecentReadMessageBy.push(this._dataByNS[NS_PEEPS][msg.mark[i]]);
      }
    }

    switch (msg.type) {
      case 'message':
        return new HumanMessage(
          null,
          localName,
          this._dataByNS[NS_PEEPS][msg.author],
          new Date(msg.composedAt),
          new Date(msg.receivedAt),
          msg.text,
          mostRecentReadMessageBy
        );
      case 'join':
        return new JoinMessage(
          null,
          localName,
          this._dataByNS[NS_PEEPS][msg.inviter],
          this._dataByNS[NS_PEEPS][msg.invitee],
          new Date(msg.receivedAt),
          mostRecentReadMessageBy
        );
      default:
        throw new Error("Unhandled message type: '" + msg.type + "'");
    }
  },

  _delta_convmsgs: function(curRep, delta, lookup, forget) {
    var i, peep;
    var explainDelta = {
      mark: null,
      unmark: null,
    };
    for (var attr in delta) {
      switch (attr) {
        case 'mark':
          explainDelta.mark = [];
          for (i = 0; i < delta.mark.length; i++) {
            peep = lookup(NS_PEEPS, delta.mark[i]);
            curRep.mostRecentReadMessageBy.push(peep);
            explainDelta.mark.push(peep);
          }
          break;
        case 'unmark':
          explainDelta.unmark = [];
          for (i = 0; i < delta.unmark.length; i++) {
            var peepName = delta.unmark[i];
            for (var j = 0; j < curRep.mostRecentReadMessageBy.length; j++) {
              if (curRep.mostRecentReadMessageBy[j]._localName === peepName) {
                explainDelta.unmark.push(
                  curRep.mostRecentReadMessageBy.splice(j, 1)[0]);
                break;
              }
            }
          }
          break;
      }
    }
    return explainDelta;
  },

  _transform_convnew: function(localName, wireRep, lookup) {
    var messages = [], i;
    for (i = 0; i < wireRep.messages.length; i++) {
      messages.push(this._dataByNS.convmsgs[wireConv.messages[i]]);
    }
    return new NewConversationActivity(null,
      localName, this._dataByNS.convnew[wireRep.conv],
      wireRep.numNew, messages);
  },

  _delta_convnew: function(curRep, delta, lookup, forget) {
    var msg, i;
    var explainDelta = {
      addedMessages: null,
      removedMessages: null,
    };
    for (var attr in delta) {
      switch (attr) {
        case 'add':
          explainDelta.addedMessages = [];
          for (i = 0; i < delta.add.length; i++) {
            msg = lookup(NS_CONVMSGS, delta.add[i]);
            curRep.newMessages.push(msg);
            explainDelta.addedMessages.push(msg);
            curRep.numNewMessages++;
          }
          break;
        case 'moot':
          explainDelta.removedMessages =
            curRep.newMessages.splice(0, delta.moot);
          curRep.numNewMessages -= delta.moot;
          break;
      }
    }
    // - always recompute authors
    // (because both messages and moot can affect this)
    // We don't generate an explicit delta list right now, but we could if it
    //  turns out consumers would benefit and their UI helpers don't already
    //  cover it sufficiently well.
    curRep._deriveAuthors();

    return explainDelta;
  },

  _transform_possfriends: function(localName, wireRep, lookup) {
    var peepRep = this._dataByNS.peeps[wireRep.peepLocalName];
    return new PossibleFriend(null, localName, peepRep);
  },

  _delta_possfriends: function(curRep, delta) {
    // no delta processing at this time because no deltas
  },

  /**
   * Create a `ConnectRequest` representation from the wire rep.
   */
  _transform_connreqs: function(localName, wireRep, lookup) {
    var peepRep = this._dataByNS.peeps[wireRep.peepLocalName];
    var serverRep = this._dataByNS.servers[wireRep.serverLocalName];
    return new ConnectRequest(null, localName, peepRep, serverRep,
      wireRep.theirPocoForUs, wireRep.receivedAt, wireRep.messageText);
  },

  _delta_connreqs: function(curRep, delta) {
    // no deltas yet
  },

  /**
   * Create an `ErrorRep` from the wire rep.
   */
  _transform_errors: function(localName, wireRep, lookup) {
    return new ErrorRep(
      null, localName,
      wireRep.errorId, wireRep.errorParam,
      wireRep.firstReported, wireRep.lastReported,
      wireRep.reportedCount,
      wireRep.userActionRequired, wireRep.permanent);
  },

  _delta_errors: function(curRep, delta) {
    curRep.lastReported = new Date(delta.lastReported);
    curRep.reportedCount = delta.reportedCount;
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
    liveset.blurb = this._cloneItemIntoLiveset(liveset, convBlurb);
    this._handleMap[handle] = liveset;
    this._sets.push(liveset);
    this._send('queryConvMsgs', handle, {
      localName: convBlurb._localName,
    });
    return liveset;
  },

  queryAllConversations: function(query, listener, data) {
    if (query.by !== 'all')
      throw new Error("only supported ordering is 'all'");
    var handle = this._nextHandle++;
    var liveset = new LiveOrderedSet(this, handle, NS_CONVBLURBS, query,
                                     listener, data);
    this._handleMap[handle] = liveset;
    this._sets.push(liveset);
    this._send('queryAllConversations', handle, { query: query });
    return liveset;
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
  // Notifications
  //
  // These are posed as queries rather than straight-up change notifications
  //  because in the world of multiple clients we want to be able to take back
  //  notifications.  Also, we update the aggregate notifications as more come
  //  in.

  /**
   */
  queryNewConversationActivity: function() {
    var handle = this._nextHandle++;
    var liveset = new LiveOrderedSet(this, handle, NS_CONVNEW, query, listener,
                                     data);
    this._handleMap[handle] = liveset;
    this._sets.push(liveset);
    this._send('queryNewConversationActivity', handle, query);
    return liveset;
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
