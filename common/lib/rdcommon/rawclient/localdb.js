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
    'rdcommon/crypto/keyops', 'rdcommon/crypto/pubring',
    'rdcommon/messages/generator',
    './schema', './notifking', './lstasks',
    'module',
    'exports'
  ],
  function(
    $Q,
    $log,
    $task, $taskerrors,
    $keyops, $pubring,
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
 * XXX the below is speculative; we are using our DB abstraction for now and
 *  will ideally implement one that provides the below characteristics.  We
 *  are also writing things without thinking out the SSD ramifications too much
 *  because we are under time pressure.
 *
 * Local storage implementation will be targeting a LevelDB implementation,
 *  although we will likely be using SQLite initially owing to bindings already
 *  existing.
 *
 * Our implementation is problem domain aware.
 */
function LocalStore(dbConn, keyring, _logger) {
  this._log = LOGFAB.localStore(this, _logger, null);

  this._db = dbConn;
  this._keyring = keyring;
  this._notif = new $notifking.NotificationKing(this, this._log);

  /**
   * The set of root keys of pinned peeps.
   */
  this._pinnedPeepRootKeys = null;

  this._db.defineHbaseTable($lss.TBL_PEEP_DATA, ["d"]);
  this._db.defineReorderableIndex($lss.TBL_PEEP_DATA,
                                  $lss.IDX_PEEP_WRITE_INVOLVEMENT);
  this._db.defineReorderableIndex($lss.TBL_PEEP_DATA,
                                  $lss.IDX_PEEP_RECIP_INVOLVEMENT);
  this._db.defineReorderableIndex($lss.TBL_PEEP_DATA,
                                  $lss.IDX_PEEP_ANY_INVOLVEMENT);

  // conversation data proper: just data for now, (Was: meta, overview, data)
  this._db.defineHbaseTable($lss.TBL_CONV_DATA, ["d"]);

  this._db.defineReorderableIndex($lss.TBL_CONV_DATA, $lss.IDX_ALL_CONVS);

  this._db.defineReorderableIndex($lss.TBL_CONV_DATA,
                                  $lss.IDX_CONV_PEEP_WRITE_INVOLVEMENT);
  this._db.defineReorderableIndex($lss.TBL_CONV_DATA,
                                  $lss.IDX_CONV_PEEP_RECIP_INVOLVEMENT);
  this._db.defineReorderableIndex($lss.TBL_CONV_DATA,
                                  $lss.IDX_CONV_PEEP_ANY_INVOLVEMENT);

  this._bootstrap();
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
      return this._fetchAndReportPeepBlurbsById(query, convIds);
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
      while (iConv++ < conversationIds.length) {
        var convId = conversationIds[iConv], clientData;
        // - attempt cache re-use
        if ((clientData = self._notif.reuseIfAlreadyKnown(queryHandle,
                                                          NS_CONVBLURBS,
                                                          convId))) {
          viewItems.push(clientData.localName);
          continue;
        }

        return when(self._fetchConversationBlurb(queryHandle,
                                                 conversationIds[iConv]),
                    function(clientData) {
          viewItems.push(clientData.localName);
          getNextMaybeGot();
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
          store: this,
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
    var idx;
    switch (queryHandle.queryDef.by) {
      case 'alphabet':
        idx = $lss.IDX_PEEP_CONTACT_NAME;
        break;
      case 'any':
        idx = $lss.IDX_PEEP_ANY_INVOLVEMENT;
        break;
      case 'recip':
        idx = $lss.IDX_PEEP_RECIP_INVOLVEMENT;
        break;
      case 'write':
        idx = $lss.IDX_PEEP_WRITE_INVOLVEMENT;
        break;
      default:
        throw new Error("Unsupported ordering: " + by);
    }
    return when(this._db.scanIndex($lss.TBL_PEEP_DATA, idx, '',
                                   null, null, null, null, null, null),
      this._fetchAndReportPeepBlurbsById.bind(this, queryHandle));
  },

  _fetchAndReportPeepBlurbsById: function(queryHandle, peepRootKeys) {
    var deferred = $Q.defer();
    var iPeep = 0, self = this,
        viewItems = [];
    if (queryHandle.namespace === NS_PEEPS)
      queryHandle.splices.push({index: 0, howMany: 0, items: viewItems});
    function getNextMaybeGot() {
      while (iPeep++ < peepRootKeys.length) {
        var peepRootKey = peepRootKeys[iPeep], clientData;
        // - perform cache lookup, reuse only if valid
        // (_deferringPeepQueryResolve creates speculative entries and we are
        //  the logic that actually fulfills them.)
        if ((clientData = self._notif.reuseIfAlreadyKnown(queryHandle,
                                                          NS_CONVBLURBS,
                                                          peepRootKey))) {
          if (clientData.data) {
            viewItems.push(clientData.localName);
            continue;
          }
        }

        return when(self._fetchPeepBlurb(queryHandle, peepRootKeys[iPeep],
                                         clientData),
                    function(resultClientData) {
          viewItems.push(resultClientData.localName);
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
        deps: null,
      };
      queryHandle.membersByLocal[NS_CONVBLURBS][localName] = clientData;
      queryHandle.membersByFull[NS_CONVBLURBS][convId] = clientData;
    }
    return when(this._db.getRow($lss.TBL_PEEP_DATA, peepRootKey, null),
                function(cells) {
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
                                peepRootKey, now),
      this._db.updateIndexValue($lss.TBL_PEEP_DATA,
                                $lss.IDX_PEEP_WRITE_INVOLVEMENT,
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
