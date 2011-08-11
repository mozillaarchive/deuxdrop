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
 * (A smart) client's local datastore consisting of local replicas of subsets of
 *  data whose canonical copies lives on the mailstore.  In some cases, such as
 *  peeps, we will have the entire dataset available locally.  In most other
 *  cases we will have recently new/updated, recently accessed, or marked as
 *  important subsets of data around.   Where data = conversations + messages.
 **/

define(
  [
    'q',
    'rdcommon/log',
    'rdcommon/taskidiom', 'rdcommon/taskerrors',
    'rdcommon/crypto/keyops',
    'rdcommon/identities/pubident', 'rdcommon/crypto/pubring',
    'rdcommon/messages/generator',
    './schema', './notifking', './lstasks',
    'module',
    'exports'
  ],
  function(
    $Q,
    $log,
    $task, $taskerrors,
    $keyops,
    $pubident, $pubring,
    $msg_gen,
    $lss, $notifking, $ls_tasks,
    $module,
    exports
  ) {
var when = $Q.when;

const PINNED = 'pinned';

const NS_PEEPS = 'peeps',
      NS_CONVBLURBS = 'convblurbs',
      NS_CONVALL = 'convall';

/**
 * An optimization we are capable of performing is that we do not have to store
 *  things in a particularly encrypted form.  This allows us to potentially
 *  save a lot of CPU/power.
 *
 * Our local storage implementation is targeting an IndexedDB-on-LevelDB
 *  implementation.
 *
 * Our implementation is problem domain aware to make things more readable and
 *  because previous efforts (gloda) have suggested the extra abstraction just
 *  proves confusing or never gets used.  This specifically means that when
 *  loading a conversation, we have the conversation loading code trigger the
 *  load of the related contacts, etc. rather than defining a more abstract
 *  schema or set of helper classes that try and magically do it for us.
 */
function LocalStore(dbConn, keyring, pubring, _logger) {
  this._log = LOGFAB.localStore(this, _logger, null);

  this._db = dbConn;
  this._keyring = keyring;
  this._pubring = pubring;
  this._notif = new $notifking.NotificationKing(this, this._log);

  /**
   * The set of root keys of pinned peeps.
   */
  this._pinnedPeepRootKeys = null;

  // initialize the db schema and kickoff the bootstrap once the db is happy
  var self = this;
  when(this._db.defineSchema($lss.dbSchemaDef), function() {
    self._bootstrap();
  });
}
exports.LocalStore = LocalStore;
LocalStore.prototype = {
  toString: function() {
    return '[LocalStore]';
  },
  toJSON: function() {
    return {type: 'LocalStore'};
  },

  //////////////////////////////////////////////////////////////////////////////
  // Bootstrap
  _bootstrap: function() {
    // - load our list of pinned peeps by root key
    // XXX actually load after we actually support pinned peeps
  },

  //////////////////////////////////////////////////////////////////////////////
  // Replica API

  generateReplicaCryptoBlock: function(command, id, payload) {
    var block = {
      cmd: command,
      id: id,
      when: Date.now(),
      data: payload
    };
    var blockStr = JSON.stringify(block);
    var nonce = $keyops.makeSecretBoxNonce();
    var sboxed = this._keyring.secretBoxUtf8With(
                   blockStr, nonce, 'replicaSbox');
    return {nonce: nonce, sboxed: sboxed};
  },

  generateReplicaAuthBlock: function(command, id, payload) {
    var block = {
      cmd: command,
      id: id,
      when: Date.now(),
      data: payload
    };
    var blockStr = JSON.stringify(block);
    var authed = this._keyring.authUtf8With(blockStr, 'replicaAuth');
    return {block: blockStr, auth: authed};
  },

  /**
   * Consume and process one of the many varieties of replica blocks:
   * - crypted block issued by a client (trustworthy)
   * - authenticated block issued by a client (trustworthy)
   * - conversation data from the mailstore (needs validation of nougat)
   * - connect/contact request
   */
  consumeReplicaBlock: function(serialized) {
    // (we used to JSON.stringify, now we don't)
    var mform = serialized,
        authed, block;
    if (mform.hasOwnProperty("fanmsg")) {
      return this._proc_fanmsg(mform);
    }
    // explicitly typed, currently implies contact request
    else if(mform.hasOwnProperty("type")) {
      return this._proc_reqmsg(mform);
    }
    else {
      if (mform.hasOwnProperty("nonce")) {
        block = JSON.parse(this._keyring.openSecretBoxUtf8With(
                    mform.sboxed, mform.nonce, 'replicaSbox'));
      }
      else {
        this._keyring.verifyAuthUtf8With(mform.auth, mform.block,
                                         'replicaAuth');
        block = JSON.parse(mform.block);
      }
      return this._performReplicaCommand(block.cmd, block.id, block.data);
    }
  },

  /**
   * Perform a replica command.
   *
   * Note that we do not differentiate between whether the command came to us
   *  via a secret-boxed or authenticated block.
   */
  _performReplicaCommand: function(command, id, payload) {
    var implCmdName = "_cmd_" + command;
    if (!(implCmdName in this)) {
      throw new Error("no command for '" + block.cmd + "'");
    }
    return this._log.replicaCmd(command, this,
                                 this[implCmdName],
                                 id, payload);
  },

  generateAndPerformReplicaCryptoBlock: function(command, id, payload) {
    var serialized = this.generateReplicaCryptoBlock(command, id, payload);
    this._performReplicaCommand(command, id, payload);
    return serialized;
  },

  generateAndPerformReplicaAuthBlock: function(command, id, payload) {
    var serialized = this.generateReplicaAuthBlock(command, id, payload);
    this._performReplicaCommand(command, id, payload);
    return serialized;
  },

  /**
   * Notification from the client that the server has conveyed that we are
   *  caught up, and, accordingly, we can release any notifications we were
   *  batching up.
   */
  replicaCaughtUp: function() {
    this._notif.updatePhaseDoneReleaseNotifications();
  },

  //////////////////////////////////////////////////////////////////////////////
  // Notifications

  _notifyNewMessagesInConversation: function(convId, msgDataItems) {

  },

  /**
   * If there are any required dataDeps for the queryHandle, then retrieve them
   *  and re-run, otherwise send the query results.
   */
  _fillOutQueryDepsAndSend: function(queryHandle) {
    if (queryHandle.dataNeeded[NS_CONVBLURBS].length) {
      var convIds = queryHandle.dataNeeded[NS_CONVBLURBS].splice(0,
                      queryHandle.dataNeeded[NS_CONVBLURBS].length);
      return this._fetchAndReportConversationBlurbsById(query, convIds);
    }
    if (queryHandle.dataNeeded[NS_PEEPS].length) {
      var peepRootKeys = queryHandle.dataNeeded[NS_PEEPS].splice(0,
                           queryHandle.dataNeeded[NS_PEEPS].length);
      return this._fetchAndReportPeepBlurbsById(queryHandle, peepRootKeys);
    }
    return this._notif.sendQueryResults(queryHandle);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Conversation Lookup

  _fetchAndReportConversationBlurbsById: function(queryHandle,
                                                  conversationIds) {
    var deferred = $Q.defer();
    var iConv = 0, self = this,
        viewItems = [];
    queryHandle.splices.push({
      index: 0, howMany: 0, items: viewItems,
    });
    function getNextMaybeGot() {
      while (iConv < conversationIds.length) {
        var convId = conversationIds[iConv], clientData;
        // - attempt cache re-use
        if ((clientData = self._notif.reuseIfAlreadyKnown(queryHandle,
                                                          NS_CONVBLURBS,
                                                          convId))) {
          viewItems.push(clientData.localName);
          iConv++;
          continue;
        }

        return when(self._fetchConversationBlurb(queryHandle,
                                                 conversationIds[iConv]),
                    function(clientData) {
          viewItems.push(clientData.localName);
          iConv++;
          return getNextMaybeGot();
        });
      }

      return self._fillOutQueryDepsAndSend(queryHandle);
    }

    return getNextMaybeGot();
  },

  /**
   * Retrieve a converation blurb from the datastore for inclusion in the
   *  provided query.  Only invoked after failing to retrieve the data from
   *  cache, and so always generates a new data structure.  The structure is
   *  immediately named and contributed to the members map prior to yielding
   *  control flow so that no duplicate loading occurs.
   */
  _fetchConversationBlurb: function(queryHandle, convId) {
    var querySource = queryHandle.owner;
    var localName = "" + (querySource.nextUniqueIdAlloc++);
    var deps = [];
    var clientData = {
      localName: localName,
      fullName: convId,
      count: 1,
      data: null,
      indexValues: null,
      deps: deps,
    };
    queryHandle.membersByLocal[NS_CONVBLURBS][localName] = clientData;
    queryHandle.membersByFull[NS_CONVBLURBS][convId] = clientData;

    return when(this._db.getRow($lss.TBL_CONV_DATA, convId, null),
                function(cells) {
      // we need the meta on our side...
      clientData.data = cells['d:meta'];
      // -- build the client rep
      var numMessages = cells['m'];
      var participants = [];
      for (var key in cells) {
        // - participants
        if (/^d:p/.test(key)) {
          participants.push(self._deferringPeepQueryResolve(queryHandle,
                                                            cells[key],
                                                            deps));
        }
      }
      // - first (non-join) message...
      var msg, iMsg, firstMsgRep;
      for (iMsg = 0; iMsg < numMessages; iMsg++) {
        msg = cells['d:m' + iMsg];
        if (msg.type === 'message') {
          firstMsgRep = {
            type: 'message',
            author: self._deferringPeepQueryResolve(queryHandle, msg.authorId,
                                                    deps),
            composedAt: msg.composedAt,
            receivedAt: msg.receivedAt,
            text: msg.text,
          };
          break;
        }
      }

      // - number of unread
      // XXX unread status not yet dealt with. pragmatism!
      var numUnreadTextMessages = 1, firstUnreadMsgRep = null;
      for (; iMsg < numMessages; iMsg++) {
        msg = cells['d:m' + iMsg];
        if (msg.type === 'message') {
          numUnreadTextMessages++;
          // - first unread (non-join) message...
          if (!firstUnreadMsgRep) {
            firstUnreadMsgRep = {
              type: 'message',
              author: self._deferringPeepQueryResolve(queryHandle, msg.authorId,
                                                      deps),
              composedAt: msg.composedAt,
              receivedAt: msg.receivedAt,
              text: msg.text,
            };
          }
        }
      }

      queryHandle.dataMap[NS_CONVBLURBS][localName] = {
        participants: participants,
        firstMessage: firstMsgRep,
        firstUnreadMessage: firstUnreadMsgRep,
        pinned: false,
        numUnread: numUnreadTextMessages,
      };

      return clientData;
    });
  },

  /**
   * Notification about a new conversation; we check if there are any affected
   *  conversation queries and if so perform the required contact
   *  lookup/dependency generation.
   *
   * We are notified about conversations once our user is joined to them.
   */
  _notifyNewConversation: function(convMeta, cells) {
    //if (this._notif.checkForInterestedQueries(NS_CONVBLURBS
  },

  /**
   * Notification about a new message in a conversation; we trigger updates
   *  for both blurbs (about message counts) and full conversations (provide
   *  the message with lookups and deps).
   */
  _notifyNewMessage: function(messageType) {
  },

  /**
   * Retrieve full conversation data.  Only invoked on cache miss, so creates a
   *  new clientData data structure that is immediately linked into our rep.
   */
  _fetchConversationInFull: function(queryHandle, convId) {
    var querySource = queryHandle.owner;
    var localName = "" + (querySource.nextUniqueIdAlloc++);
    var deps = [];
    var clientData = {
      localName: localName,
      fullName: convId,
      count: 1,
      data: null,
      indexValues: null,
      deps: deps,
    };
    queryHandle.membersByLocal[NS_CONVALL][localName] = clientData;
    queryHandle.membersByFull[NS_CONVALL][convId] = clientData;

    return when(this._db.getRow($lss.TBL_CONV_DATA, convId, null),
                function(cells) {
      // we need the meta on our side...
      clientData.data = cells['d:meta'];
      // -- build the client rep
      var numMessages = cells['m'];
      var participants = [];
      for (var key in cells) {
        // - participants
        if (/^d:p/.test(key)) {
          participants.push(self._deferringPeepQueryResolve(queryHandle,
                                                            cells[key],
                                                            deps));
        }
      }
      // - all messages
      var msg, iMsg, messages = [];
      for (iMsg = 0; iMsg < numMessages; iMsg++) {
        msg = cells['d:m' + iMsg];
        if (msg.type === 'message') {
          messages.push({
            type: 'message',
            author: self._deferringPeepQueryResolve(queryHandle, msg.authorId,
                                                    deps),
            composedAt: msg.composedAt,
            receivedAt: msg.receivedAt,
            text: msg.text,
          });
          break;
        }
        else if (msg.type === 'join') {
          messages.push({
            type: 'join',
            inviter: self._deferringPeepQueryResolve(queryHandle, msg.by, deps),
            invitee: self._deferringPeepQueryResolve(queryHandle, msg.id, deps),
            receivedAt: msg.receivedAt,
            text: msg.text,
          });
        }
        else {
          throw new Error("Unknown message type '" + msg.type + "'");
        }
      }

      // - number of unread
      // XXX unread status not yet dealt with. pragmatism!
      var numUnreadTextMessages = 1, firstUnreadMsgRep = null;
      for (; iMsg < numMessages; iMsg++) {
        msg = cells['d:m' + iMsg];
        if (msg.type === 'message') {
          numUnreadTextMessages++;
          // - first unread (non-join) message...
          if (!firstUnreadMsgRep) {
            firstUnreadMsgRep = {
              type: 'message',
              author: self._deferringPeepQueryResolve(queryHandle, msg.authorId,
                                                      deps),
              composedAt: msg.composedAt,
              receivedAt: msg.receivedAt,
              text: msg.text,
            };
          }
        }
      }

      queryHandle.dataMap[NS_CONVBLURBS][localName] = {
        participants: participants,
        messages: messages,
        pinned: false,
      };

      return clientData;
    });
  },

  /**
   * Get the list of conversations a user is involved with.
   *
   * @args[
   *   @param[peep]
   *   @parma[query @dict[
   *     @key[involvement @oneof['any' 'recip' 'write']]
   *   ]
   * ]
   */
  queryAndWatchPeepConversationBlurbs: function(queryHandle, peepRootKey) {
    // - pick the index to use
    var index;
    switch (queryHandle.queryDef.involvement) {
      case 'any':
        index = $lss.IDX_CONV_PEEP_ANY_INVOLVEMENT;
        break;
      case 'recip':
        index = $lss.IDX_CONV_PEEP_RECIP_INVOLVEMENT;
        break;
      case 'write':
        index = $lss.IDX_CONV_PEEP_WRITE_INVOLVEMENT;
        break;
      default:
        throw new Error("bad involvement type: '" + query.involvement + "'");
    }
    queryHandle.index = index;

    // - generate an index scan, netting us the conversation id's, hand-off
    return when(this._db.scanIndex($lss.TBL_CONV_DATA, index, peepRootKey,
                                   null, null, null, null, null, null),
      this._fetchAndReportConversationBlurbsById.bind(this, queryHandle));
  },


  //////////////////////////////////////////////////////////////////////////////
  // Index Updating
  //
  // We potentially maintain a lot of indices, and the code gets very dry,
  //  so we centralize it.

  /**
   * Update conversation indices, both global and per-peep; this covers
   *  write/recip/any and pinned permutations.  (Note that we don't
   *  have per-peep pinned indices because the presumption is that filtering
   *  will be cheap enough in that case.)
   */
  _updateConvIndices: function(convId, convPinned, authorRootKey, recipRootKeys,
                               timestamp) {
    var promises = [],
        authorIsOurUser = (authorRootKey === this._keyring.rootPublicKey);
    // - global conversation list
    promises.push(this._db.updateIndexValue(
      $lss.TBL_CONV_DATA, $lss.IDX_ALL_CONVS, '', convId, timestamp));
    // - global pinned conversation list
    if (convPinned)
      promises.push(this._db.updateIndexValue(
        $lss.TBL_CONV_DATA, $lss.IDX_ALL_CONVS, PINNED, convId, timestamp));

    // - per-peep write/any involvement for the author
    promises.push(this._db.updateIndexValue(
      $lss.TBL_CONV_DATA, $lss.IDX_CONV_PEEP_WRITE_INVOLVEMENT, authorRootKey,
      convId, timestamp));
    promises.push(this._db.updateIndexValue(
      $lss.TBL_CONV_DATA, $lss.IDX_CONV_PEEP_ANY_INVOLVEMENT, authorRootKey,
      convId, timestamp));
    // - per-peep (maybe recip)/any involvement for the recipients
    for (var iRecip = 0; iRecip < recipRootKeys.length; iRecip++) {
      var rootKey = recipRootKeys[iRecip];
      // - boost any involvement
      promises.push(this._db.updateIndexValue(
        $lss.TBL_CONV_DATA, $lss.IDX_CONV_PEEP_ANY_INVOLVEMENT,
        rootKey, convId, timestamp));
      // - boost recip involvement
      if (authorIsOurUser)
        promises.push(this._db.updateIndexValue(
          $lss.TBL_CONV_DATA, $lss.IDX_CONV_PEEP_RECIP_INVOLVEMENT,
          rootKey, convId, timestamp));

    }



    return $Q.all(promises);
  },

  /**
   * Update the peep indices; this covers write/recip/any and pinned
   *  permutations.  The caller does not need to worry about knowing whether
   *  people are pinned; we keep that information around and cached.
   */
  _updatePeepIndices: function(authorRootKey, recipRootKeys, timestamp) {
    var promises = [];
    // write/any involvement for the author
    // (maybe) pinned variants
    // (maybe recip)/any involvement for the recipients
    // (maybe) pinned variants

    return $Q.all(promises);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Contact Request Processing

  _proc_reqmsg: function(reqmsg) {
    // XXX store, do display stuff, etc.
    this._log.contactRequest(reqmsg.senderKey);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Conversation Processing

  /**
   * Process a conversation fan-out message, delegating to the appropriate task.
   */
  _proc_fanmsg: function(fanmsg) {
    // -- invite?
    // (This gets to be the root of the conversation on the mailstore; it comes
    //  from the welcome message, which, for consistency reasons, the mailstore
    //  breaks apart and pretends does not exist to us.)
    if (fanmsg.hasOwnProperty("sentBy")) {
      return (new $ls_tasks.ConvInviteTask({store: this, fanmsg: fanmsg},
                                          this._log)).run();
    }
    // -- fanout message
    else {
      // - decrypt fanout envelope (transit server to our envelope key)
      var fanoutEnv = JSON.parse(
        this._keyring.openBoxUtf8With(fanmsg.fanmsg, fanmsg.nonce,
                                      fanmsg.transit,
                                      'messaging', 'envelopeBox'));

      var self = this;
      // just grab all the cells; XXX timecopout caching/unification
      return when(this._db.getRow($lss.TBL_CONV_DATA, fanmsg.convId, "d"),
                  function(cells) {
        if (!cells.hasOwnProperty("d:meta"))
          throw new $taskerrors.MissingPrereqFatalError();
        var convMeta = cells["d:meta"];

        var arg = {
          store: self,
          convMeta: convMeta,
          fanoutEnv: fanoutEnv,
          cells: cells,
        };
        var taskClass;
        switch(fanoutEnv.type) {
          case 'join':
            return (new $ls_tasks.ConvJoinTask(arg, self._log)).run();
            break;
          case 'message':
            return (new $ls_tasks.ConvMessageTask(arg, self._log)).run();
            break;
          case 'meta':
            return (new $ls_tasks.ConvMetaTask(arg, self._log)).run();
            break;
          default:
            throw new $taskerrors.MalformedPayloadError(
                        'bad type: ' + fanoutEnv.type);
        }
      });
    }
  },

  _cmd_convCreate: function() {

  },

  /**
   * Our own meta-data about a conversation (pinned, etc.)
   */
  _cmd_setConvMeta: function() {
    // -- update any subscribed queries on pinned
    // -- update any blurbs for this conversation
  },

  /**
   * Our user has composed a message to a conversation; track it for UI display
   *  but be ready to nuke it when the actual message successfully hits the
   *  conversation.
   */
  /*
  _cmd_outghostAddConversationMessage: function() {
  },
  */

  //////////////////////////////////////////////////////////////////////////////
  // Peep Lookup

  /**
   * Return true if the cells indicate the peep is a contact.
   */
  _testfunc_peepContactNoFilter: function(baseCells, mutatedCells) {
    // if the mutated cell has oident, then it is either an addition/deletion
    if (mutatedCells.hasOwnProperty('d:oident')) {
      return mutatedCells['d:oident'] !== null;
    }
    else if (baseCells.hasOwnProperty('d:oident')) {
      return baseCells['d:oident'] !== null;
    }
    return false;
  },

  /**
   * Return true if the cells indicate the peep is a pinned contact.  Being
   *  pinned implies being a contact, so we only need to do that check.  The
   *  pinned status is tracked in the general metadata blob, d:meta, which is
   *  atomically updated.
   */
  _testfunc_peepContactPinnedFilter: function(baseCells, mutatedCells) {
    if (mutatedCells.hasOwnProperty('d:meta')) {
      return mutatedCells['d:meta'].pinned;
    }
    else if (baseCells.hasOwnProperty('d:meta')) {
      return baseCells['d:meta'].pinned;
    }
    return false;
  },

  _cmpfunc_peepContactName: function(a, b) {
    return a.indexValues[$lss.IDX_PEEP_CONTACT_NAME].localeCompare(
             b.indexValues[$lss.IDX_PEEP_CONTACT_NAME]);
  },

  _cmpfunc_peepAnyInvolvement: function(a, b) {
    return a.indexValues[$lss.IDX_PEEP_ANY_INVOLVEMENT] -
             b.indexValues[$lss.IDX_PEEP_ANY_INVOLVEMENT];
  },

  _cmpfunc_peepRecipInvolvement: function(a, b) {
    return a.indexValues[$lss.IDX_PEEP_RECIP_INVOLVEMENT] -
             b.indexValues[$lss.IDX_PEEP_RECIP_INVOLVEMENT];
  },

  _cmpfunc_peepWriteInvolvement: function(a, b) {
    return a.indexValues[$lss.IDX_PEEP_WRITE_INVOLVEMENT] -
             b.indexValues[$lss.IDX_PEEP_WRITE_INVOLVEMENT];
  },

  /**
   * Issue a live query on a (sub)set of peeps.  We care about changes to the
   *  peeps in the set after we return it, plus changes to the membership of
   *  the set.
   *
   * @args[
   *   @param[by @oneof['alphabet' 'any' 'recip' 'write']]
   *   @param[filter @oneof[null 'pinned']]
   * ]
   */
  queryAndWatchPeepBlurbs: function(queryHandle) {
    var idx, scanFunc = 'scanIndex', indexParam;
    switch (queryHandle.queryDef.by) {
      case 'alphabet':
        idx = $lss.IDX_PEEP_CONTACT_NAME;
        scanFunc = 'scanStringIndex';
        queryHandle.cmpFunc = this._cmpfunc_peepContactName;
        break;
      case 'any':
        idx = $lss.IDX_PEEP_ANY_INVOLVEMENT;
        queryHandle.cmpFunc = this._cmpfunc_peepAnyInvolvement;
        break;
      case 'recip':
        idx = $lss.IDX_PEEP_RECIP_INVOLVEMENT;
        queryHandle.cmpFunc = this._cmpfunc_peepRecipInvolvement;
        break;
      case 'write':
        idx = $lss.IDX_PEEP_WRITE_INVOLVEMENT;
        queryHandle.cmpFunc = this._cmpfunc_peepWriteInvolvement;
        break;
      default:
        throw new Error("Unsupported ordering: " + queryHandle.queryDef.by);
    }
    queryHandle.index = idx;

    switch (queryHandle.queryDef.filter) {
      case undefined:
      case null:
        indexParam = '';
        queryHandle.testFunc = this._testfunc_peepContactNoFilter;
        break;
      case 'pinned':
        indexParam = 'pinned';
        queryHandle.testFunc = this._testfunc_peepContactPinnedFilter;
        break;
      default:
        throw new Error("Unsupported filter: " + queryHandle.queryDef.filter);
    }
    return when(this._db[scanFunc]($lss.TBL_PEEP_DATA, idx, indexParam,
                                   null, null, null, null, null, null),
      this._fetchAndReportPeepBlurbsById.bind(this, queryHandle, idx));
  },

  _notifyNewContact: function(peepRootKey, cells, mutatedCells) {
    // -- bail if no one cares
    if (!this._notif.checkForInterestedQueries(NS_PEEPS, cells, mutatedCells))
      return;

    // -- normalize the cells into the blurb rep
    // XXX much of this could probably be refactored to avoid duplication
    //  between us an _fetchPeepBlurb.
    var ourRep = {
      oident: mutatedCells['d:oident'] || cells['d:oident'] || null,
      sident: mutatedCells['d:sident'] || cells['d:sident'],
    };

    var ourPoco = ourRep.oident ?
      $pubident.peekOtherPersonIdentNOVERIFY(ourRep.oident).localPoco : null;
    var selfPoco =
      $pubident.peekPersonSelfIdentNOVERIFY(ourRep.sident).poco;
    var blurbRep = {
      ourPoco: ourPoco,
      selfPoco: selfPoco,
      numUnread: mutatedCells['d:nunread'] || cells['d:nunread'],
      numConvs: mutatedCells['d:nconvs'] || cells['d:nconvs'],
    };

    // XXX either we should not be fully populating or item added should
    //  eliminate the un-needed index values.
    var indexValues = {};
    indexValues[$lss.IDX_PEEP_CONTACT_NAME] = ourPoco.displayName;
    // XXX we probably need to perform a lookup to populate these, since
    //  the values should already exist, etc.
    indexValues[$lss.IDX_PEEP_ANY_INVOLVEMENT] = 0;
    indexValues[$lss.IDX_PEEP_RECIP_INVOLVEMENT] = 0;
    indexValues[$lss.IDX_PEEP_WRITE_INVOLVEMENT] = 0;

    // -- generate the notification
    this._notif.namespaceItemAdded(NS_PEEPS, peepRootKey,
                                   cells, mutatedCells, indexValues,
                                   blurbRep, ourRep);
  },

  _fetchAndReportPeepBlurbsById: function(queryHandle, usingIndex,
                                          peepRootKeys) {
    this._log.fetchPeepBlurbs(queryHandle.uniqueId, peepRootKeys);
    var deferred = $Q.defer();
    var iPeep = 0, stride = 1, self = this,
        viewItems = [], clientDataItems = null;

    if (usingIndex) {
      queryHandle.items = clientDataItems = [];
      queryHandle.splices.push({index: 0, howMany: 0, items: viewItems});
      stride = 2;
    }
    function getNextMaybeGot() {
      while (iPeep < peepRootKeys.length) {
        var peepRootKey = peepRootKeys[iPeep], clientData;
        // - perform cache lookup, reuse only if valid
        // (_deferringPeepQueryResolve creates speculative entries and we are
        //  the logic that actually fulfills them.)
        if ((clientData = self._notif.reuseIfAlreadyKnown(queryHandle,
                                                          NS_CONVBLURBS,
                                                          peepRootKey))) {
          if (clientData.data) {
            if (usingIndex) {
              if (!clientData.indexValues)
                clientData.indexValues = {};
              clientData.indexValues[usingIndex] = peepRootKeys[iPeep + 1];
            }
            viewItems.push(clientData.localName);
            if (clientDataItems)
              clientDataItems.push(clientData);
            iPeep += stride;
            continue;
          }
        }

        return when(self._fetchPeepBlurb(queryHandle, peepRootKeys[iPeep],
                                         clientData),
                    function(resultClientData) {
          if (usingIndex) {
            if (!clientData.indexValues)
              clientData.indexValues = {};
            clientData.indexValues[usingIndex] = peepRootKeys[iPeep + 1];
          }
          viewItems.push(resultClientData.localName);
          if (clientDataItems)
            clientDataItems.push(resultClientData);
          iPeep += stride;
          getNextMaybeGot();
        });
      }

      return self._fillOutQueryDepsAndSend(queryHandle);
    }

    return getNextMaybeGot();
  },

  _fetchPeepBlurb: function(queryHandle, peepRootKey, clientData) {
    // if we don't already have a data-empty structure, create one
    if (!clientData) {
      var querySource = queryHandle.owner;
      var localName = "" + (querySource.nextUniqueIdAlloc++);
      clientData = {
        localName: localName,
        fullName: peepRootKey,
        count: 1,
        data: null,
        indexValues: null,
        deps: null,
      };
      queryHandle.membersByLocal[NS_PEEPS][localName] = clientData;
      queryHandle.membersByFull[NS_PEEPS][peepRootKey] = clientData;
    }
    var self = this;
    return when(this._db.getRow($lss.TBL_PEEP_DATA, peepRootKey, null),
                function(cells) {
      self._log.fetchPeepBlurb(queryHandle.uniqueId, peepRootKey, cells);
      // -- our data
      var signedOident = cells.hasOwnProperty('d:oident') ?
                           cells['d:oident'] : null;
      clientData.data = {
        oident: signedOident,
        sident: cells['d:sident'],
      };
      // -- client data
      var ourPoco = signedOident ?
        $pubident.peekOtherPersonIdentNOVERIFY(signedOident).localPoco : null;

      var selfPoco =
        $pubident.peekPersonSelfIdentNOVERIFY(cells['d:sident']).poco;
      queryHandle.dataMap[NS_PEEPS][clientData.localName] = {
        ourPoco: ourPoco,
        selfPoco: selfPoco,
        numUnread: cells['d:nunread'],
        numConvs: cells['d:nconvs'],
        pinned: false,
      };
      return clientData;
    });
  },

  /**
   * Resolve the peepRootKey to a local name for the given handle, adding it
   *  to the list of records to look up during the appropriate batch phase if
   *  not already known.
   */
  _deferringPeepQueryResolve: function(queryHandle, peepRootKey, addToDeps) {
    var fullMap = queryHandle.membersByFull[NS_PEEPS], clientData;
    if (fullMap.hasOwnProperty(peepRootKey)) {
      clientData = fullMap[peepRootKey];
      clientData.count++;
      return clientData.localName;
    }

    queryHandle.dataNeeded[NS_PEEPS].push(peepRootKey);
    var localName = "" + (queryHandle.owner.nextUniqueIdAlloc++);
    clientData = {
      localName: localName,
      fullName: peepRootKey,
      count: 1,
      data: null,
      indexValues: null,
      deps: null, // peeps have no additional deps
    };
    queryHandle.membersByLocal[localName] = clientData;
    fullMap[peepRootKey] = clientData;
    addToDeps.push(clientData);

    return clientData.localName;
  },

  //////////////////////////////////////////////////////////////////////////////
  // Peep Mutation
  //
  // "My peeps"; people I have an explicit relationship with and who are allowed
  //  to send me messages

  /**
   * Add a contact to our address book.
   *
   * @designCall[clarkbw]{
   *   Adding a contact acts like the user you sent you a message at that
   *   instant.  We may eventually add fake messages 'like "Andrew and you
   *   are connected.  Here's everything you know about him now..."'.
   * }
   */
  _cmd_addContact: function(peepRootKey, signedOident) {
    var now = Date.now();

    var arg = {
      store: this, peepOident: signedOident, othPubring: this._pubring,
    };
    return $Q.wait(
      (new $ls_tasks.PeepNameTrackTask(arg, this._log)).run(),
      this._db.updateIndexValue($lss.TBL_PEEP_DATA,
                                $lss.IDX_PEEP_ANY_INVOLVEMENT,
                                '',
                                peepRootKey, now),
      this._db.updateIndexValue($lss.TBL_PEEP_DATA,
                                $lss.IDX_PEEP_WRITE_INVOLVEMENT,
                                '',
                                peepRootKey, now));
  },

  /**
   * Set some meta-data about a contact in our address book (pinned, etc.)
   */
  _cmd_metaContact: function(peepRootKey, meta) {
    this._db.putCells($lss.TBL_PEEP_DATA, peepRootKey, {
      'd:meta': meta,
    });
    // -- persist
    // -- notify affected queries
    // -- notify subscribed blurbs
  },

  /**
   * Set some contact-provided meta-data about a contact in our address book.
   */
  /*
  _cmd_setContactPeepMeta: function() {
  },
  */

  /*
  _cmd_delContact: function() {
  },
  */

  //////////////////////////////////////////////////////////////////////////////
};

var LOGFAB = exports.LOGFAB = $log.register($module, {
  localStore: {
    //implClass: AuthClientConn,
    type: $log.DAEMON,
    subtype: $log.DAEMON,
    events: {
      contactRequest: {requester: 'key'},

      newConversation: {convId: true},
      conversationMessage: {convId: true, nonce: true},

      // -- query
      fetchPeepBlurbs: {handle: false},
      fetchPeepBlurb: {handle: false},
    },
    TEST_ONLY_events: {
      // -- query
      fetchPeepBlurbs: {peepRootKeys: false},
      fetchPeepBlurb: {peepRootKey: false, cells: false},
    },
    calls: {
      replicaCmd: {command: true},
    },
    TEST_ONLY_calls: {
      replicaCmd: {id: true},
    },
  },
});
}); // end define
