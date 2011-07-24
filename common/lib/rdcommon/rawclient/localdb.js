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

const NS_PEEPS = 'peeps';

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
  this._notif = new $notifking.NotificationKing(this);

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
  //////////////////////////////////////////////////////////////////////////////
  // Bootstrap
  _bootstrap: function() {
    // - load our list of pinned peeps by root key
    // XXX actually load
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

  //////////////////////////////////////////////////////////////////////////////
  // Conversation Lookup

  _fetchAndReportConversationBlurbsById: function(qhandle, conversationIds) {
    var deferred = $Q.defer();
    var iConv = 0, self = this;
    function getNextMaybeGot(row) {
      while (iConv < conversationIds.length) {


        return when(self._fetchConversationBlurb(qhandle,
                                                 conversationIds[iConv]),
                    function() {

        });
      }
      return msgBack;
    }


    return getNextMaybeGot(null);
  },

  _fetchConversationBlurb: function(qhandle, convId) {

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
  queryAndWatchPeepConversationBlurbs: function(handle, peepRootKey, query) {
    // - pick the index to use
    var index;
    switch (query.involvement) {
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
      this._fetchAndReportConversationBlurbsById.bind(this, handle));
  },

  /**
   * Request notifications whenever new/unseen messages are added.  This results
   *  in us providing the specific message record plus the conversation blurb.
   */
  subscribeToNewUnseenMessages: function() {
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
   *   @param[by @oneof['recency' 'alphabet']]
   *   @param[filter @oneof[null 'pinned']]
   * ]
   */
  queryAndWatchPeepBlurbs: function(by, filter) {
    var idx;
    switch (by) {
      case 'recency':
        idx = $lss.IDX_PEEP_ANY_INVOLVEMENT;
        break;
      default:
        throw new Error("Unsupported ordering: " + by);
    }
    return when(this._db.scanIndex($lss.TBL_PEEP_DATA, idx, '',
                                   null, null, null, null, null, null),
      function(rootKeys) {
        var promises = [];
        for (var iKey = 0; iKey < rootKeys.length; iKey++) {
          var rootKey = rootKeys[iKey];
          promises.push();
        }
      }
      // rejection pass-through is desired
      );
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
  // Peeps

  //////////////////////////////////////////////////////////////////////////////
  // Contact/Peep overlap

  /**
   * A person was added in a conversation; if the person is not a contact
   *  but rather a peep, boost the reference count and make note of their
   *  relationship.
   *
   * XXX this is speculative work that needs to be filled out
   */
  _nameTrack: function(oidentPayload, inviterPubring) {
  },

  /**
   * A previously namechecked name is no longer relevant because the
   *  conversation is being expired, etc.
   */
  _nameGone: function() {
  },


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
