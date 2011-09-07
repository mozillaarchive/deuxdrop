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
 * Moda test helper logic that constitutes a meta-representation and behaviour
 *  check of the moda representation.  It may seem silly, but it's much more
 *  comprehensive and reliable a way to do it than having a massive set of
 *  manually created permutations in the unit tests.  (Note, however, that we
 *  do need to make sure to actually create all the permutations that need
 *  to be tested in the unit test.)
 *
 * Our interaction with the moda layer is one of direct consumer which we then
 *  expose into the logging framework.
 *
 * Our knowledge of (expected) state is (intentionally) limited to what we infer
 *  from the actions taken by the testing layer in the test.  Specifically, we
 *  don't query the database to find out the (already) known contacts but rather
 *  rely on the test command to add a contact.  This is a desirable limitation
 *  because it avoids having our tests use broken circular reasoning, but it
 *  does mean that if we have a test that starts from database persisted state
 *  then the testing layer needs to be fed that expected state somehow.
 * A specific example of what we want to avoid is having broken program logic
 *  that nukes the contact database and then have the testing logic assume
 *  the user is supposed to have no contacts.  Obviously if our testing logic
 *  was written in a way that it nukes its expected set of contacts too,
 *  this will not help, but that's why we generate human understandable logs;
 *  so that the author can sanity check what actions the tests actually took
 *  and check the results.
 *
 * In general, we try and leverage the internal structures of the "testClient"
 *  and "thing" representations rather than building our own redundant shadow
 *  data structures.
 *
 * Our interaction with testClient/testServer is handled by registering ourself
 *  with the testClient instances so that when testClient expectation
 *  methods are invoked, it can call us so that we can contribute to test steps
 *  and optionally provide additional test steps.
 * For example, when sending a conversation message, all participanting
 *  testClients will have do_expectConvMessage invoked on them.  We can insert
 *  actions into the replica processing stage about what happens on the client
 *  non-UI logic thread with gated notifications to the UI thread, then
 *  introduce an additional step where we release the notifications to the UI
 *  thread.
 *
 * @typedef[DynamicContactInfo @dict[
 *   @key[rootKey]
 *   @key[name String]{
 *     The contact's name which is the testClient's name. (So, usually 'A', 'B',
 *     'C', etc.)
 *   }
 *   @key[involvedConvs @listof[DynamicConvInfo]]
 *
 *   @group["Peep Indices"
 *     @key[any TestDomainSeq]
 *     @key[write TestDomainSeq]
 *     @key[recip TestDomainSeq]
 *   ]
 * ]]{
 *   Stores all our information about the contact from the perspective of the
 *   owning moda instance.
 * }
 *
 * @typedef[DynamicConvInfo @dict[
 *   @key[tConv ThingProto]{
 *     The 'thing' encapsulating the conversation.  Keep in mind the thing has
 *     a 'global' perspective (as opposed to our moda client instance
 *     perspective.)
 *   }
 *   @key[highestMsgSeen Number]{
 *     The index of the last message in `tConv`'s backlog that we have seen.
 *     This allows us to reuse backlog to get at the message representations
 *     without assuming we have seen all the messages in the backlog.
 *   }
 *   @key[highestMsgReported Number]{
 *     The highest message number that has been reported to convmsgs queries.
 *   }
 *   @key[peepSeqsByName @dictof[
 *     @key["peep name"]
 *     @value[@dict[
 *       @key[any TestDomainSeq]
 *       @key[write TestDomainSeq]
 *       @key[recip TestDomainSeq]
 *     ]]
 *   ]]
 *   @key[participantInfos @listof[DynamicContactInfo]]
 * ]]{
 *   Information about conversations, created as the moda testhelper hears about
 *   them via __receiveConvWelcome.  They become associated with contacts as
 *   we hear the join messages.
 * }
 **/

define(function(require, exports, $module) {

var $Q = require('q'),
    when = $Q.when;

var $testdata = require('rdcommon/testdatafab');

var $log = require('rdcommon/log');

var $moda_api = require('rdcommon/moda/api'),
    $moda_backside = require('rdcommon/moda/backside'),
    $ls_tasks = require('rdcommon/rawclient/lstasks');

var $testwrap_backside = require('rdcommon/moda/testwrappers');

var fakeDataMaker = $testdata.gimmeSingletonFakeDataMaker();


/**
 * Traverse `list`, using the "id" values of the items in the list as keys in
 *  the dictionary `obj` whose values are set to `value`.
 */
function markListIntoObj(list, obj, value) {
  for (var i = 0; i < list.length; i++) {
    obj[list[i]] = value;
  }
}

/**
 * Assists in generating delta-expectation representations related to persistent
 *  queries.
 */
var DeltaHelper = exports.DeltaHelper = {
  makeEmptyDelta: function() {
    return {
      preAnno: {},
      state: {},
      postAnno: {},
    };
  },

  _PEEP_QUERY_KEYFUNC: function(x) { return x.rootKey; },

  _PEEP_QUERY_BY_TO_CMPFUNC: {
    alphabet: function(a, b) {
      if (!a.name)
        throw new Error("A is weird: " + JSON.stringify(a));
      return a.name.localeCompare(b.name);
    },
    any: function(a, b) {
      return a.any - b.any;
    },
    recip: function(a, b) {
      return a.recip - b.recip;
    },
    write: function(a, b) {
      return a.write - b.write;
    },
  },

  _PEEPCONV_QUERY_KEYFUNC: function(x) { return x.tConv.digitalName; },
  _THINGMSG_KEYFUNC: function(x) { return x.digitalName; },

  /**
   * Generate the delta rep for the initial result set of a peep query.
   */
  peepExpDelta_base: function(lqt, cinfos, queryBy) {
    var delta = this.makeEmptyDelta();

    lqt._cinfos = cinfos;
    lqt._sorter = this._PEEP_QUERY_BY_TO_CMPFUNC[queryBy];
    cinfos.sort(lqt._sorter);
    var rootKeys = cinfos.map(this._PEEP_QUERY_KEYFUNC);
    markListIntoObj(rootKeys, delta.state, null);
    markListIntoObj(rootKeys, delta.postAnno, 1);

    return delta;
  },

  /**
   * Generate the delta rep for a completely new contact.
   */
  peepExpDelta_added: function(lqt, newCinfo) {
    var delta = this.makeEmptyDelta();

    // -- preAnno
    // nothing to do for an addition; there are no removals

    // -- state / postAnno
    // - insert the cinfo, resort
    // (This is less efficient than finding the sort point via binary search, but
    //  since we may screw that logic up and that's how we do it for the actual
    //  impl, we want to do it a different way for the expectation.)
    var cinfos = lqt._cinfos;
    cinfos.push(newCinfo);
    cinfos.sort(lqt._sorter);

    // - generate state
    markListIntoObj(cinfos.map(this._PEEP_QUERY_KEYFUNC), delta.state, null);

    // - postAnno update for the inserted dude.
    delta.postAnno[this._PEEP_QUERY_KEYFUNC(newCinfo)] = 1;

    return delta;
  },

  /**
   * Check whether a new message has affected the ordering of a peep query and
   *  generate a delta if so.
   */
  peepExpMaybeDelta_newmsg: function(lqt, modifiedCinfo) {
    var cinfos = lqt._cinfos;
    var preIndex = cinfos.indexOf(modifiedCinfo);
    cinfos.sort(lqt._sorter);
    // no change in position, no delta.
    if (cinfos.indexOf(modifiedCinfo) === preIndex)
      return null;

    var delta = this.makeEmptyDelta();
    // mark the moving guy in the pre
    delta.preAnno[modifiedCinfo.rootKey] = 0;
    // fill in the new order
    var rootKeys = cinfos.map(this._PEEP_QUERY_KEYFUNC);
    markListIntoObj(rootKeys, delta.state, null);
    // mark the moving guy in the post too
    delta.postAnno[modifiedCinfo.rootKey] = 0;

    return delta;
  },

  /**
   * Generate the delta rep for the inital result set of a conversations-by-peep
   *  query.
   */
  peepConvsExpDelta_base: function(lqt, cinfo, allConvs, queryBy) {
    var delta = this.makeEmptyDelta();

    // filter conversations to ones actually involving the given cinfo
    lqt._convs = allConvs.filter(function(convInfo) {
      return convInfo.participantInfos.indexOf(cinfo) !== -1;
    });
    lqt._sorter = function(a, b) {
      var va = a.peepSeqsByName[cinfo.name][queryBy],
          vb = b.peepSeqsByName[cinfo.name][queryBy];
      return va - cb;
    };
    lqt._convs.sort(lqt._sorter);

    var convIds = lqt._convs.map(this._PEEPCONV_QUERY_KEYFUNC);
    markListIntoObj(convIds, delta.state, null);
    markListIntoObj(convIds, delta.postAnno, 1);

    return delta;
  },

  /**
   * Generate the delta rep for a peep being added to a conversation for a
   *  conversations-by-peep query.
   */
  peepConvsExpDelta_joined: function(lqt, convInfo) {
    var delta = this.makeEmptyDelta();

    lqt._convs.push(convInfo);
    lqt._convs.sort(lqt._sorter);

    markListIntoObj(lqt._convs.map(this._PEEPCONV_QUERY_KEYFUNC),
                    delta.state, null);

    delta.postAnno[this._PEEPCONV_QUERY_KEYFUNC(convInfo)] = 1;

    return delta;
  },

  /**
   * Check whether a rep delta occurs for a conversations-by-peep query and
   *  generate a delta if so.  A delta may occur because of a new message added
   *  to the conversation that necessarily affects some timestamps, but it may
   *  also not occur if it isn't a relevant timestamp or it does not change
   *  the ordering of the conversation relative to other conversations.
   */
  peepConvsExpMaybeDelta_newmsg: function(lqt, convInfo) {
    var preIndex = lqt._convs.indexOf(convInfo);
    lqt._convs.sort(lqt._sorter);
    if (lqt._convs.indexOf(convInfo) === preIndex)
      return null;

    var delta = this.makeEmptyDelta();
    markListIntoObj(lqt._convs.map(this._PEEPCONV_QUERY_KEYFUNC),
                    delta.state, null);
    var convId = this._PEEPCONV_QUERY_KEYFUNC(convInfo);
    delta.preAnno[convId] = 0;
    delta.postAnno[convId] = 0;
    return delta;
  },

  convMsgsDelta_base: function(lqt, seenMsgs) {
    var delta = this.makeEmptyDelta();
    markListInfoObj(seenMsgs.map(this._THINGMSG_KEYFUNC), delta.state, null);
    markListInfoObj(seenMsgs.map(this._THINGMSG_KEYFUNC), delta.postAnno, 1);
    return delta;
  },

  convMsgsDelta_added: function(lqt, seenMsgs, addedMsgs) {
    var delta = this.makeEmptyDelta();
    markListInfoObj(seenMsgs.map(this._THINGMSG_KEYFUNC), delta.state, null);
    markListInfoObj(addedMsgs.map(this._THINGMSG_KEYFUNC), delta.postAnno, 1);
    return delta;
  },
};

/**
 * There should be one moda-actor per moda-bridge.  So if we are simulating
 *  a desktop client UI that implements multiple tabs, each with their own
 *  moda bridge, then there should be multiple actor instances.
 */
var TestModaActorMixins = {
  __constructor: function(self, opts) {
    if (!opts.client)
      throw new Error("Moda actors must be associated with a client!");
    self._testClient = opts.client;
    self._testClient._staticModaActors.push(self);

    /** @listof[TestClient] */
    self._dynamicContacts = [];
    /** @listof[DynamicContactInfo] */
    self._dynamicContactInfos = [];
    /** @dictof["client name" DynamicContactInfo] */
    self._contactMetaInfoByName = {};

    /** @listof[DynamicConvInfo] */
    self._dynamicConvInfos = [];
    /** @dictof["conv thing human name" DynamicConvInfo] */
    self._convInfoByName = {};

    self._dynamicPeepQueries = [];
    self._dynamicPeepConvQueries = [];
    // XXX need an all-conv-queries thing
    self._dynamicConvMsgsQueries = [];

    self._dynPendingQueries = [];
    // convinfos queries awaiting a __updatePhaseComplete notification to occur
    //  before generating their added messages expectations
    self._dynPendingConvMsgs = [];

    self._eBackside = self.T.actor('modaBackside', self.__name, null, self);

    self.T.convenienceSetup(self, 'initialize', self._eBackside, function() {
      self._testClient._modaActors.push(self);

      // - create our self-corresponding logger, it will automatically hookup
      self._logger = LOGFAB.testModa(self, self._testClient._logger,
                                     self.__name);

      self._notif = self._testClient._rawClient.store._notif;

      // - create the moda backside
      self._backside = new $moda_backside.ModaBackside(
                             self._testClient._rawClient, self.__name,
                             self._logger);

      // - create the moda bridge
      // (It has no logger and thus we create no actor; all its events get
      //   logged by us on our logger.)
      self._bridge = new $moda_api.ModaBridge();

      // - link backside and bridge (hackily)
      self._bridge._sendObjFunc = self._backside.XXXcreateBridgeChannel(
                                    self._bridge._receive.bind(self._bridge));
    });
  },

  //////////////////////////////////////////////////////////////////////////////
  // Shadow Contact Information

  /**
   * Retrieve our test-only contact info meta-structure from the perspective
   *  of the moda bridge.
   */
  _lookupContactInfo: function(contactTestClient) {
    return this._contactMetaInfoByName[contactTestClient.__name];
  },

  _getDynContactInfos: function() {
    return this._dynamicContactInfos.concat();
  },


  //////////////////////////////////////////////////////////////////////////////
  // Query Update Helpers

  /**
   * We have heard about a newly added contact, generate expectations for all
   *  the queries over peeps that match.
   * XXX pinned handling
   */
  _notifyPeepAdded: function(newCinfo) {
    var queries = this._dynamicPeepQueries;
    for (var iQuery = 0; iQuery < queries.length; iQuery++) {
      var lqt = queries[iQuery];

      // in the case of an addition we expect a positioned splice followed
      //  by a completion notification
      var deltaRep = DeltaHelper.peepExpDelta_added(lqt, newCinfo);

      this.RT.reportActiveActorThisStep(this);
      this.expect_queryCompleted(lqt.__name, deltaRep);
    }
  },

  /**
   * Conversation activity has (possibly) affected a peep's indices,
   *  generate expectations for the relevant queries if we believe ordering
   *  is affected.
   */
  _notifyPeepTimestampsChanged: function(cinfo) {
    var queries = this._dynamicPeepQueries;
    for (var iQuery = 0; iQuery < queries.length; iQuery++) {
      var lqt = queries[iQuery];

      var deltaRep = DeltaHelper.peepExpMaybeDelta_newmsg(lqt, cinfo);
      if (deltaRep) {
        this.RT.reportActiveActorThisStep(this);
        this.expect_queryCompleted(lqt.__name, deltaRep);
      }
    }
  },

  _notifyPeepJoinedConv: function(cinfo, convInfo) {
    var queries = this._dynamicPeepConvQueries;
    for (var iQuery = 0; iQuery < queries.length; iQuery++) {
      var lqt = queries[iQuery];

      var deltaRep = DeltaHelper.peepConvsExpDelta_joined(lqt, convInfo);
      this.RT.reportActiveActorThisStep(this);
      this.expect_queryCompleted(lqt.__name, deltaRep);
    }
  },

  /**
   * Conversation activity has affected a conversation blurb's indices,
   *  generate expectations for the relevant queries if this has affected
   *  blurb ordering.
   */
  _notifyPeepConvTimestampsChanged: function(cinfo, convIndices, convInfo) {
    var queries = this._dynamicPeepConvQueries;
    for (var iQuery = 0; iQuery < queries.length; iQuery++) {
      var lqt = queries[iQuery];

      var deltaRep = DeltaHelper.peepConvsExpMaybeDelta_newmsg(lqt, convInfo);
      if (deltaRep) {
        this.RT.reportActiveActorThisStep(this);
        this.expect_queryCompleted(lqt.__name, deltaRep);
      }
    }
  },

  _notifyConvGainedMessages: function(convInfo) {
    var queries = this._dynamicConvMsgsQueries,
        backlog = convInfo.tConv.data.backlog,
        seenMsgs = backlog.slice(0, convInfo.highestMsgSeen + 1),
        addedMsgs = backlog.slice(convInfo.highestMsgReported + 1,
                                  convInfo.highestMsgSeen + 1);
    convInfo.highestMsgReported = convInfo.highestMsgSeen;
    for (var iQuery = 0; iQuery < queries.length; iQuery++) {
      var lqt = queries[iQuery];

      var deltaRep = DeltaHelper.convMsgsDelta_added(lqt, seenMsgs, addedMsgs);
      this.RT.reportActiveActorThisStep(this);
      this.expect_queryCompleted(lqt.__name, deltaRep);
    }
  },

  //////////////////////////////////////////////////////////////////////////////
  // Notifications from testClient

  /**
   * Invoked during the action step where the replica block is released to the
   *  client.  All data structure manipulations should be on dynamic ones.
   */
  __addingContact: function(other) {
    var nowSeq = this.RT.testDomainSeq;
    // -- populate our metadata for the contact
    // (most of this is for view ordering expectations)
    this._dynamicContacts.push(other);
    var newCinfo = this._contactMetaInfoByName[other.__name] = {
      rootKey: other._rawClient.rootPublicKey,
      // in our test we always use the testing name as the displayName
      name: other.__name,
      involvedConvs: [],
      any: nowSeq,
      write: nowSeq,
      recip: nowSeq,
    };
    this._dynamicContactInfos.push(newCinfo);

    // -- generate expectations about peep query deltas
    this._notifyPeepAdded(newCinfo);
  },

  __receiveConvWelcome: function(tConv) {
    // nb: tConv's backlog is a dynamic state correlated with the global
    //  conversation state as opposed to a snapshot at the time a welcome was
    //  issued.
    var convInfo = {
      tConv: tConv,
      highestMsgSeen: 0,
      highestMsgReported: 0,
      peepSeqsByName: {},
    };
    this._dynamicConvInfos.push(convInfo);
    this._convInfoByName[tConv.__name] = convInfo;

    var backlog = tConv.data.backlog;
    for (var iMsg = 0; iMsg < backlog.length; iMsg++) {
      this.__receiveConvMessage(tConv, backlog[iMsg]);
    }
    convInfo.highestMsgReported = backlog.length - 1;

    // Note!  There is never a possibility for a notification to be generated
    //  in the NS_CONVMSGS namespace on this event because it's impossible to
    //  query about a conversation before we hear about it, and we are just
    //  hearing about this guy.
  },

  __receiveConvMessage: function(tConv, tMsg) {
    var convInfo = this._convInfoByName[tConv.__name];
    if (this._dynPendingConvMsgs.indexOf(convInfo) === -1)
      this._dynPendingConvMsgs.push(convInfo);

    if (tMsg.data.type === 'message') {
      // update the author peep if it's not us.
      if (tMsg.data.author !== this._testClient) {
        var ainfo = this._lookupContactInfo(tMsg.data.author),
            convAuthIndices = convInfo.peepSeqsByName[tMsg.data.author.__name];

        ainfo.write = Math.max(ainfo.write, tMsg.data.seq);
        ainfo.any = Math.max(ainfo.any, tMsg.data.seq);
        this._notifyPeepTimestampsChanged(ainfo);

        convAuthIndices.write = tMsg.data.seq;
        convAuthIndices.any = tMsg.data.seq;
        this._notifyPeepConvTimestampsChanged(ainfo, convAuthIndices, convInfo);
      }

      var participants = tConv.data.participants;
      for (var iPart = 0; iPart < participants.length; iPart++) {
        var participant = participants[iPart];
        // do not process 'me', do not process the author again
        if (participant === this._testClient ||
            participant === tMsg.data.author)
          continue;
        var pinfo = this._lookupContactInfo(participant),
            convPartIndices = convInfo.peepSeqsByName[participant.__name];

        // recip is only updated for messages authored by our user.
        if (tMsg.data.author === this._testClient)
          pinfo.recip = Math.max(pinfo.recip, tMsg.data.seq);
        pinfo.any = Math.max(pinfo.any, tMsg.data.seq);
        this._notifyPeepTimestampsChanged(pinfo);

        if (tMsg.data.author === this._testClient)
          convPartIndices.recip = tMsg.data.seq;
        convPartIndices.any = tMsg.data.seq;
        this._notifyPeepConvTimestampsChanged(pinfo, convPartIndices,
                                              convInfo);
      }
    }
    else if (tMsg.data.type === 'join') {
      var joineeName = tMsg.data.who.__name, jinfo = null;
      if (this._contactMetaInfoByName.hasOwnProperty(joineeName))
        jinfo = this._contactMetaInfoByName[joineeName];
      var joineePartIndices = convInfo.peepSeqsByName[joineeName] = {};

      // even if the joinee is not yet a contact, we want to maintain the index
      //  information in case they later become a contact.
      joineePartIndices.any = tMsg.data.seq;
      // XXX the implementation itself is a bit confused by these right now;
      //  there's no obvious right value.
      joineePartIndices.write = null;
      joineePartIndices.recip = null;

      if (jinfo)
        this._notifyPeepJoinedConv(jinfo, convInfo);
    }
  },

  /**
   * Notification that a 'replicaCaughtUp' expectation is part of the current
   *  test step after all other moda notifications are generated.  This is
   *  generated because replicaCaughtUp gets passed through to
   *  `NotificationKing` which then uses it to decide to release any batched
   *  up convmsgs updates in a single batch.
   *
   * Ordering consistency in the event of a batch of multiple conversations
   *  (that is, avoiding non-determinism due to inconsistent traversal orders
   *  of hash tables) is avoided by the use of a pending query list that gets
   *  appended to in event order.
   *
   * XXX We will likely need to update the other notification mechanisms to
   *  use the pending list and defer actual generation until this marker, as
   *  moda does consistently use that mechanism.  However, it's not an
   *  immediate problem because apart from backlog joins, our unit test steps
   *  are so granular (and always online right now) that nothing complicated
   *  can occur in a single test step.
   */
  __updatePhaseComplete: function() {
    // -- flush out pending message addition NS_CONVMSGS queries
    var pendingConvInfos = this._dynPendingConvMsgs;
    for (var iConv = 0; iConv < pendingConvInfos.length; iConv++) {
      var convInfo = pendingConvInfos[iConv];
      this._notifyConvGainedMessages(convInfo);
    }
    this._dynPendingConvMsgs.splice(
      0, this._dynPendingConvMsgs.length);
  },

  //////////////////////////////////////////////////////////////////////////////
  // LiveSet Listener handling
  //
  // We translate the notifications into an ordered state representation that
  //  uses only the root names of things.

  _remapLocalToFullName: function(namespace, localName) {
    return this._notif.mapLocalNameToFullName(this._backside._querySource,
                                              namespace,
                                              localName);
  },

  onItemsModified: function(items, liveSet) {
    var lqt = liveSet.data, delta;
    if (!lqt._pendingDelta)
      delta = lqt._pendingDelta = DeltaHelper.makeEmptyDelta();
    else
      delta = lqt._pendingDelta;

    for (var iModified = 0; iModified < items.length; iModified++) {
      var rootKey = this._remapLocalToFullName(liveSet._ns,
                                               items[iModified]._localName);
      // don't overwrite a +1 with a zero, leave it +1
      if (!delta.postAnno.hasOwnProperty(rootKey))
        delta.postAnno[rootKey] = 0;
    }
  },

  onSplice: function(index, howMany, addedItems, liveSet) {
    var lqt = liveSet.data, delta;
    if (!lqt._pendingDelta)
      delta = lqt._pendingDelta = DeltaHelper.makeEmptyDelta();
    else
      delta = lqt._pendingDelta;

    // - removals
    // this happens prior to actually performing the splice on the set's items
    var iRemoved = index, highRemoved = index + howMany, rootKey;
    for (; iRemoved < highRemoved; iRemoved++) {
      // (this is dealing with the moda 'user' visible representations)
      rootKey = this._remapLocalToFullName(liveSet._ns,
                                           liveSet.items[iRemoved]._localName);
      delta.preAnno[rootKey] = -1;
    }

    // - additions
    for (var iAdded = 0; iAdded < addedItems.length; iAdded++) {
      // (this is dealing with the wire rep)
      rootKey = this._remapLocalToFullName(liveSet._ns,
                                           addedItems[iAdded]._localName);
      delta.postAnno[rootKey] = 1;
    }

    // (state population happens during the completed notification)

    // XXX implement this, very similar to logic in `client-db-views.js`, steal.
    //this._logger.queryUpdateSplice(liveSet.data.__name, deltaRep);
  },

  onCompleted: function(liveSet) {
    var lqt = liveSet.data, delta, rootKey;
    if (!lqt._pendingDelta)
      delta = lqt._pendingDelta = DeltaHelper.makeEmptyDelta();
    else
      delta = lqt._pendingDelta;

    // - revised state
    for (var i = 0; i < liveSet.items.length; i++) {
      rootKey = this._remapLocalToFullName(liveSet._ns,
                                           liveSet.items[i]._localName);
      delta.state[rootKey] = null;
    }

    this._logger.queryCompleted(liveSet.data.__name, delta);
    lqt._pendingDelta = null;
  },

  //////////////////////////////////////////////////////////////////////////////
  // Queries: Issue
  //
  // Instantiate a new live query.  We check the results of the query (once
  //  concluded) to ensure that the results match the expected testing state.
  //  Additionally, all future test-induced state changes we hear about will
  //  have expectations generated for them.  Use `do_killQuery` when you are
  //  done with the query.

  /**
   * Issue and name a moda peeps query.
   */
  do_queryPeeps: function(thingName, query) {
    var lqt = this.T.thing('livequery', thingName), self = this;
    lqt._pendingDelta = null;

    this.T.action(this, 'create', lqt, function() {
      // -- generate the expectation
      // get and order the contact infos for generating the state; hold onto
      //  this.
      var delta = DeltaHelper.peepExpDelta_base(
                    lqt, self._getDynContactInfos(), query.by);
      self.expect_queryCompleted(lqt.__name, delta);

      lqt._liveset = self._bridge.queryPeeps(query, self, lqt);
      self._dynamicPeepQueries.push(lqt);
    });

    return lqt;
  },

  /**
   * Issue and name a moda conversations query on conversations involving a
   *  given peep.  To make things realistic, you need to provide us with a query
   *  that contains the peep in question so we can get the right reference.
   */
  do_queryPeepConversations: function(thingName, usingQuery, peepClient,
                                      query)  {
    var lqt = this.T.thing('livequery', thingName), self = this;
    lqt._pendingDelta = null;
    this.T.action(this, 'create', lqt, function() {
      var peep = self._grabPeepFromQueryUsingClient(usingQuery, peepClient),
          cinfo = self._lookupContactInfo(peepClient);

      var delta = DeltaHelper.peepConvsExpDelta_base(
        lqt, cinfo, self._dynamicConvInfos, query.by);
      self.expect_queryCompleted(lqt.__name, delta);

      lqt._liveset = self._bridge.queryPeepConversations(peep, query,
                                                         self, lqt);
      self._dynamicPeepConvQueries.push(lqt);
    });

    return lqt;
  },

  do_queryConversations: function(query) {
    throw new Error("XXX no all-conversations query testing support yet");
  },

  do_queryConversationMessages: function(usingQuery, tConv) {
    var lqt = this.T.thing('livequery', thingName), self = this;
    lqt._pendingDelta = null;
    this.T.action(this, 'create', lqt, function() {
      var convBlurb = self._grabConvBlurbFromQueryUsingConvThing(
                        usingQuery, tConv),
          convInfo = self._convInfoByName[tConv.__name],
          seenMsgs = tConv.data.backlog.slice(0, convInfo.highestMsgSeen + 1);

      var delta = DeltaHelper.convMsgsDelta_base(lqt, seenMsgs);
      self.expect_queryCompleted(lqt.__name, delta);

      lqt._liveset = self._bridge.queryConversationMessages(convBlurb,
                                                            self, lqt);

      self._dynamicConvMsgsQueries.push(lqt);
    });

    return lqt;
  },

  //////////////////////////////////////////////////////////////////////////////
  // Queries: Kill

  /**
   * Unsubscribe a live query and forget about it.  We structure our listeners
   *  so that if the live query logic screws up and keeps sending us events
   *  we will throw up errors.
   */
  do_killQuery: function() {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Query Lookup Helpers

  _grabPeepFromQueryUsingClient: function(lqt, testClient) {
    var items = lqt._liveset.items;
    for (var i = 0; i < items.length; i++) {
      if (items[i].selfPoco.displayName === testClient.__name)
        return items[i];
    }
    throw new Error("Unable to map testClient '" + testClient.__name +
                    + "' back to a PeepBlurb instsance.");
  },

  _mapPeepsFromQueryUsingClients: function(lqt, testClients) {
    var peeps = [];
    for (var i = 0; i < testClients.length; i++) {
      peeps.push(this._grabPeepFromQueryUsingClient(lqt, testClients[i]));
    }
    return peeps;
  },

  /**
   * Retrieve the appropriate `ConversationBlurb` from a live query (thing
   *  wrapper) or throw if it can't be found.  We match based on the text
   *  of the message that started the conversation.  Another alternative would
   *  be to look into the notification king's queryHandle structure and map
   *  the full name to the correct local name.  We're not doing the latter
   *  because it wouldn't translate to a more realistic testing scenario
   *  as well.
   */
  _grabConvBlurbFromQueryUsingConvThing: function(lqt, tConv) {
    var backlog = tConv.data.backlog, blurbs = lqt._liveset.items,
        firstMessageText;
    for (var iMsg = 0; iMsg < backlog.length; iMsg++) {
      if (backlog[iMsg].data.type === 'message') {
        firstMessageText = backlog[iMsg].data.text;
        break;
      }
    }
    for (var iBlurb = 0; iBlurb < blurbs.length; iBlurb++) {
      if (blurbs[iBlurb].firstMessage.text === firstMessageText)
        return blurbs[iBlurb];
    }
    throw new Error("Unable to find conversation blurb with first message " +
                    "text: '" + firstMessageText + "'");
  },

  //////////////////////////////////////////////////////////////////////////////
  // Actions

  /**
   * Create a conversation (using the moda API).  The entire testClient
   *  conversation creation set of steps is run, plus we wait for the
   *  moda representation updates once the conversation creation process
   *  makes it back to us.
   *
   * Right now the moda conversation creation API returns nothing useful
   *  to us about the conversation it created, and we won't hear about resulting
   *  blurbs etc. until after the conversation has hit the servers and come
   *  back to us.  We hackily address this
   */
  do_createConversation: function(tConv, tMsg, usingPeepQuery, recipients) {
    var youAndMeBoth = [this._testClient].concat(recipients);
    tConv.sdata = {
      participants: youAndMeBoth.concat(),
      fanoutServer: this._testClient._usingServer,
    };
    tConv.data = null;

    var messageText;

    var self = this;
    // - moda api transmission to bridge
    this.T.action('moda sends createConversation to', this._eBackside,
                  function() {
      self.holdAllModaCommands();
      self.expectModaCommand('createConversation');

      messageText = fakeDataMaker.makeSubject();
      self._bridge.createConversation({
        peeps: self._mapPeepsFromQueryUsingClients(usingPeepQuery, recipients),
        text: messageText,
      });
    });
    // - bridge processes it
    this.T.action(this._eBackside, 'processes createConversation, invokes on',
                  this._testClient._eRawClient, function() {
      self._testClient._expect_createConversation_createPrep();

      var convCreationInfo = self.releaseAndPeekAtModaCommand(
                               'createConversation');
      self.stopHoldingAndAssertNoHeldModaCommands();

      self._testClient._expect_createConversation_rawclient_to_server(
        convCreationInfo, messageText, youAndMeBoth, tConv, tMsg);
    });

    // - fanout server onwards
    this._testClient._expdo_createConversation_fanout_onwards(tConv);

    // XXX do something to make sure we get the conversation blurb somehow,
    //  or maybe leave it up to the reply guy if he provides us with a thing
  },

  do_replyToConversationWith: function(tConv, tNewMsg, usingConvQuery) {
    var messageText;

    var self = this;
    // - moda api transmission to bridge
    this.T.action('moda sends replyToConv to', this._eBackside, function() {
      self.holdAllModaCommands();
      self.expectModaCommand('replyToConv');

      messageText = fakeDataMaker.makeSubject();
      var convBlurb = self._grabConvBlurbFromQueryUsingConvThing(usingConvQuery,
                                                                 tConv);
      convBlurb.replyToConversation({
        text: messageText,
      });
    });
    // - bridge processes it
    this.T.action(this._eBackside, 'processes createConversation, invokes on',
                  this._testClient._eRawClient, function() {
      self._testClient._expect_replyToConversation_replyPrep(tConv, tNewMsg);

      var msgInfo = self.releaseAndPeekAtModaCommand('replyToConv');
      self.stopHoldingAndAssertNoHeldModaCommands();

      self._testClient._expect_replyToConversation_rawclient_to_server(
        tConv, tNewMsg, msgInfo, messageText);
    });

    // - fanout server onwards
    this._testClient._expdo_replyToConversation_fanout_onwards(tConv, tNewMsg);
  },

  do_inviteToConversation: function(usingPeepQuery, invitedTestClient, tConv) {
    tConv.sdata.participants.push(invitedTestClient);
    var tJoin = this.T.thing('message', 'join ' + invitedTestClient.__name);

    var self = this;
    // - moda api transmission to bridge
    this.T.action('moda sends inviteToConv to', this._eBackside, function() {
      self.holdAllModaCommands();
      self.expectModaCommand('inviteToConv');

      var convBlurb = self._grabConvBlurbFromQueryUsingConvThing(usingConvQuery,
                                                                 tConv);
      convBlurb.inviteToConversation({
        peep: self._grabPeepFromQueryUsingClient(usingPeepQuery,
                                                 invitedTestClient),
      });
    });
    // - bridge processes it
    this.T.action(this._eBackside, 'processes createConversation, invokes on',
                  this._testClient._eRawClient, function() {
      self._testClient._expect_inviteToConversation_invitePrep(
        invitedTestClient);

      var msgInfo = self.releaseAndPeekAtModaCommand('inviteToConv');
      self.stopHoldingAndAssertNoHeldModaCommands();

      self._testClient._expect_inviteToConversation_rawclient_to_server(
        invitedTestClient, tConv, tJoin, msgInfo);
    });

    this._testClient._expdo_inviteToConversation_sender_onwards(
      invitedTestClient, tConv, tJoin);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Notification Queries

  //////////////////////////////////////////////////////////////////////////////
  // Holding: Backside Communications

  /**
   * Hold commands received by the backside that were sent by a moda bridge.
   */
  holdAllModaCommands: function() {
    if (!("__hold_all" in this._backside))
      $testwrap_backside.modaBacksideWrap(this._backside, this._logger);
    this._backside.__hold_all(true);
  },

  /**
   * Expcet that the backside will receive a command with the given name from
   *  a moda bridge.
   */
  expectModaCommand: function(cmd) {
    this.RT.reportActiveActorThisStep(this);
    this.expect_backsideReceived(cmd);
  },

  /**
   * Release a held moda-bridge-to-moda-backside command with the given name,
   *  returning the return value of the invocation of that command.
   */
  releaseAndPeekAtModaCommand: function(cmd) {
    return this._backside.__release_and_peek__handle(cmd);
  },

  stopHoldingAndAssertNoHeldModaCommands: function() {
    this._backside.__hold_all(false);
  },

  //////////////////////////////////////////////////////////////////////////////
};

var LOGFAB = exports.LOGFAB = $log.register($module, {
  testModa: {
    // we are a client/server client, even if we are smart for one
    type: $log.TEST_SYNTHETIC_ACTOR,
    subtype: $log.CLIENT,
    topBilling: true,

    events: {
      queryCompleted: {name: true, keys: true},

      // - wrapper holds for the backside
      backsideReceived: {cmd: true},
    },
  },
});

exports.TESTHELPER = {
  // we leave it to the testClient TESTHELPER to handle most stuff, leaving us
  //  to just worry about moda.
  LOGFAB_DEPS: [LOGFAB,
    $moda_backside.LOGFAB, $ls_tasks.LOGFAB,
  ],

  actorMixins: {
    testModa: TestModaActorMixins,
  },
};

}); // end define
