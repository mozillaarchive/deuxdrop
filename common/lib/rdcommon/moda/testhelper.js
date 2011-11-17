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
 *
 * @typedef[DynConnReqInfo @dict[
 *   @key[testClient]
 *   @key[receivedAt Number]
 *   @key[messageText String]
 * ]]
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
  var counter = 0;
  for (var i = 0; i < list.length; i++) {
    var name = list[i];
    if (obj.hasOwnProperty(name))
      throw new Error("list already has '" + name + "' in it");
    if (value === MARK_COUNTER)
      obj[name] = counter++;
    else
      obj[name] = value;
  }
}

const MARK_COUNTER = {};

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
  makeOrReuseDelta: function(lqt) {
    if (!lqt._pendingExpDelta) {
      lqt._pendingExpDelta = {
        preAnno: {},
        state: {},
        postAnno: {},
      };
    }
    else {
      // clear the state rep revery time so we can explode as needed
      lqt._pendingExpDelta.state = {};
    }
    return lqt._pendingExpDelta;
  },

  _TESTCLIENT_QUERY_KEYFUNC: function (testClient) {
    return testClient._rawClient.rootPublicKey;
  },

  _PEEP_QUERY_KEYFUNC: function(x) { return x.rootKey; },

  _PEEP_QUERY_BY_TO_CMPFUNC: {
    alphabet: function(a, b) {
      if (!a.name)
        throw new Error("A is weird: " + JSON.stringify(a));
      return a.name.localeCompare(b.name);
    },
    any: function(a, b) {
      var delta = b.any - a.any;
      if (delta)
        return delta;
      if (a.rootKey < b.rootKey)
        return -1;
      else if (a.rootKey > b.rootKey)
        return 1;
      else
        return 0;
    },
    recip: function(a, b) {
      var delta = b.recip - a.recip;
      if (delta)
        return delta;
      if (a.rootKey < b.rootKey)
        return -1;
      else if (a.rootKey > b.rootKey)
        return 1;
      else
        return 0;
    },
    write: function(a, b) {
      var delta = b.write - a.write;
      if (delta)
        return delta;
      if (a.rootKey < b.rootKey)
        return -1;
      else if (a.rootKey > b.rootKey)
        return 1;
      else
        return 0;
    },
  },

  _PEEPCONV_QUERY_KEYFUNC: function(x) { return x.tConv.digitalName; },
  _THINGMSG_KEYFUNC: function(x) { return x.digitalName; },
  _THINGMSG_TEXTFUNC: function(t) {
    var data = t.data;
    switch (data.type) {
      case 'join':
        return 'join:' + data.who.__name;
      case 'message':
        return data.author.__name + ': ' + data.text;
      default:
        throw new Error("Unknown message type: " + data.type);
    }
  },

  _REQINFO_KEYFUNC: function(reqInfo) {
    return reqInfo.testClient.__name + ': ' + reqInfo.messageText;
  },
  _REQINFO_CMPFUNC: function(a, b) {
    return b.receivedAt - a.receivedAt;
  },

  connReqDelta_base: function(lqt, reqInfos) {
    var delta = this.makeOrReuseDelta(lqt);

    lqt._reqInfos = reqInfos.concat();
    lqt._reqInfos.sort(this._REQINFO_CMPFUNC);

    var keys = lqt._reqInfos.map(this._REQINFO_KEYFUNC);
    markListIntoObj(keys, delta.state, MARK_COUNTER);
    markListIntoObj(keys, delta.postAnno, 1);

    return delta;
  },

  connReqDelta_added: function(lqt, reqInfo) {
    var delta = this.makeOrReuseDelta(lqt);

    lqt._reqInfos.push(reqInfo);
    lqt._reqInfos.sort(this._REQINFO_CMPFUNC);

    markListIntoObj(lqt._reqInfos.map(this._REQINFO_KEYFUNC),
                    delta.state, MARK_COUNTER);
    delta.postAnno[this._REQINFO_KEYFUNC(reqInfo)] = 1;

    return delta;
  },

  /**
   * Generate peep expectations from a pre-ordered set of test clients.  The
   *  expectation is that this query will never update because it is from
   *  a static data source.
   */
  peepExpStaticDelta: function(lqt, testClients) {
    var delta = this.makeOrReuseDelta(lqt);

    var rootKeys = testClients.map(this._TESTCLIENT_QUERY_KEYFUNC);
    markListIntoObj(rootKeys, delta.state, MARK_COUNTER);
    markListIntoObj(rootKeys, delta.postAnno, 1);

    return delta;
  },

  /**
   * Generate the delta rep for the initial result set of a peep query.
   */
  peepExpDelta_base: function(lqt, cinfos, queryBy) {
    var delta = this.makeOrReuseDelta(lqt);

    lqt._cinfos = cinfos;
    lqt._sorter = this._PEEP_QUERY_BY_TO_CMPFUNC[queryBy];
    cinfos.sort(lqt._sorter);
    var rootKeys = cinfos.map(this._PEEP_QUERY_KEYFUNC);
    markListIntoObj(rootKeys, delta.state, MARK_COUNTER);
    markListIntoObj(rootKeys, delta.postAnno, 1);

    return delta;
  },

  /**
   * Generate the delta rep for a completely new contact.
   */
  peepExpDelta_added: function(lqt, newCinfo) {
    var delta = this.makeOrReuseDelta(lqt);

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
    markListIntoObj(cinfos.map(this._PEEP_QUERY_KEYFUNC), delta.state,
                    MARK_COUNTER);

    // - postAnno update for the inserted dude.
    delta.postAnno[this._PEEP_QUERY_KEYFUNC(newCinfo)] = 1;

    return delta;
  },

  /**
   * Check whether a new message has affected the ordering of a peep query and
   *  generate a delta if so.
   */
  peepExpMaybeDelta_newmsg: function(lqt, modifiedCinfo, knownChange) {
    var cinfos = lqt._cinfos;
    var preIndex = cinfos.indexOf(modifiedCinfo);
    cinfos.sort(lqt._sorter);
    // no change in position, no delta.
    var moved = (cinfos.indexOf(modifiedCinfo) !== preIndex);
    if (!knownChange && !moved)
      return null;

    var delta = this.makeOrReuseDelta(lqt);
    // nb: we previously tried to mark moving people, but this seems like it
    //  it is better accomplished as a high level post-processing pass because
    //  it is very easy for a series of moves to occur which net out to the
    //  original state.
    // fill in the new order
    var rootKeys = cinfos.map(this._PEEP_QUERY_KEYFUNC);
    markListIntoObj(rootKeys, delta.state, MARK_COUNTER);

    return delta;
  },

  /**
   * Generate the delta rep for the inital result set of a conversations-by-peep
   *  query.
   */
  peepConvsExpDelta_base: function(lqt, cinfo, allConvs, queryBy) {
    var delta = this.makeOrReuseDelta(lqt);

    // filter conversations to ones actually involving the given cinfo
    lqt._convs = allConvs.filter(function(convInfo) {
      return convInfo.participantInfos.indexOf(cinfo) !== -1;
    });
    lqt._sorter = function(a, b) {
      var va = a.peepSeqsByName[cinfo.name][queryBy],
          vb = b.peepSeqsByName[cinfo.name][queryBy];
      return vb - va;
    };
    lqt._convs.sort(lqt._sorter);

    var convIds = lqt._convs.map(this._PEEPCONV_QUERY_KEYFUNC);
    markListIntoObj(convIds, delta.state, MARK_COUNTER);
    markListIntoObj(convIds, delta.postAnno, 1);

    return delta;
  },

// nop-ing out in conjunction with nop-ing _notifyPeepJoinedConv which should
//  not be required now that `peepConvsExpMaybeDelta_newmsg` is smarter.
  /**
   * Generate the delta rep for a peep being added to a conversation for a
   *  conversations-by-peep query.
   */
/*
  peepConvsExpDelta_joined: function(lqt, convInfo) {
    var delta = this.makeEmptyDelta();

    lqt._convs.push(convInfo);
    lqt._convs.sort(lqt._sorter);

    markListIntoObj(lqt._convs.map(this._PEEPCONV_QUERY_KEYFUNC),
                    delta.state, null);

    delta.postAnno[this._PEEPCONV_QUERY_KEYFUNC(convInfo)] = 1;

    return delta;
  },
*/

  /**
   * Check whether a rep delta occurs for a conversations-by-peep query and
   *  generate a delta if so.  A delta may occur because of a new message added
   *  to the conversation that necessarily affects some timestamps, but it may
   *  also not occur if it isn't a relevant timestamp or it does not change
   *  the ordering of the conversation relative to other conversations.
   *
   * We may also explicitly know that a change has occurred, in which case we
   *  definitely generate a delta.
   */
  peepConvsExpMaybeDelta_newmsg: function(lqt, convInfo, changeKnown) {
    var preIndex = lqt._convs.indexOf(convInfo);
    var added = (preIndex === -1);
    if (added)
      lqt._convs.push(convInfo);
    lqt._convs.sort(lqt._sorter);
    var moved = (lqt._convs.indexOf(convInfo) !== preIndex);
    if (!changeKnown && !moved)
      return null;

    var delta = this.makeOrReuseDelta(lqt);
    markListIntoObj(lqt._convs.map(this._PEEPCONV_QUERY_KEYFUNC),
                    delta.state, MARK_COUNTER);
    var convId = this._PEEPCONV_QUERY_KEYFUNC(convInfo);
    // we used to generate moves; no longer.
    if (added)
      delta.postAnno[convId] = 1;
    return delta;
  },

  /** Generate state only for dep notification. */
  peepConvsDelta_nop: function(lqt) {
    var delta = this.makeOrReuseDelta(lqt);
    markListIntoObj(lqt._convs.map(this._PEEPCONV_QUERY_KEYFUNC),
                    delta.state, MARK_COUNTER);
    return delta;
  },

  convMsgsDelta_base: function(lqt, seenMsgs) {
    var delta = this.makeOrReuseDelta(lqt);
    markListIntoObj(seenMsgs.map(this._THINGMSG_TEXTFUNC), delta.state,
                    MARK_COUNTER);
    markListIntoObj(seenMsgs.map(this._THINGMSG_TEXTFUNC), delta.postAnno, 1);
    return delta;
  },

  convMsgsDelta_added: function(lqt, seenMsgs, addedMsgs) {
    var delta = this.makeOrReuseDelta(lqt);
    markListIntoObj(seenMsgs.map(this._THINGMSG_TEXTFUNC), delta.state,
                    MARK_COUNTER);
    markListIntoObj(addedMsgs.map(this._THINGMSG_TEXTFUNC), delta.postAnno, 1);
    return delta;
  },

  /** Generate state only for dep notification. */
  convMsgsDelta_nop: function(lqt, seenMsgs) {
    var delta = this.makeOrReuseDelta(lqt);
    markListIntoObj(seenMsgs.map(this._THINGMSG_TEXTFUNC), delta.state,
                    MARK_COUNTER);
    return delta;
  },
};

/**
 * There should be one moda-actor per moda-bridge.  So if we are simulating
 *  a desktop client UI that implements multiple tabs, each with their own
 *  moda bridge, then there should be multiple actor instances.
 */
var TestModaActorMixins = exports.TestModaActorMixins = {
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

    /** @listof[DynamicConnReqInfo] */
    self._dynConnReqInfos = [];

    self._dynamicPeepQueries = [];
    self._dynamicPeepConvQueries = [];
    // XXX need an all-conv-queries thing
    self._dynamicConvMsgsQueries = [];

    self._dynPendingQueries = [];
    // convinfos queries awaiting a __updatePhaseComplete notification to occur
    //  before generating their added messages expectations
    self._dynPendingConvMsgs = [];

    self._dynamicConnReqQueries = [];


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
                                    self._bridge._receive.bind(self._bridge),
                                    process.nextTick.bind(process));

      // - log when a mooted message is received
      // (this should not happen under test)
      self._bridge._mootedMessageReceivedListener = function(msg) {
        self._logger.mootedMessageReceived(msg);
      };

      // - create an unlisted dynamic contact info for ourselves
      // (we want to know about ourselves for participant mapping purposes, but
      //  peep queries should never return us in their results.)
      var nowSeq = self.RT.testDomainSeq;
      self._contactMetaInfoByName[self._testClient.__name] = {
        isUs: true,
        rootKey: self._testClient._rawClient.rootPublicKey,
        name: self._testClient.__name,
        involvedConvs: [],
        any: nowSeq,
        write: nowSeq,
        recip: nowSeq,
      };
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

  _notifyConnectRequest: function(reqInfo) {
    var queries = this._dynamicConnReqQueries;
    for (var iQuery = 0; iQuery < queries.length; iQuery++) {
      var lqt = queries[iQuery];
      // all connect request queries are the same right now so they all care
      // (this changes when we start slicing)

      var deltaRep = DeltaHelper.connReqDelta_added(lqt, reqInfo);
      this._ensureExpectedQuery(lqt);
    }
  },

  /**
   * We have heard about a newly added contact, generate expectations for all
   *  the queries over peeps that match.
   * XXX pinned handling
   */
  _notifyPeepAdded: function(newCinfo) {
    var queries = this._dynamicPeepQueries;
    for (var iQuery = 0; iQuery < queries.length; iQuery++) {
      var lqt = queries[iQuery];

      // skip non-index queries (ex: new friends queries)
      if (!lqt._liveset.query.hasOwnProperty('by'))
        continue;
      // XXX we also need to discard based on 'pinned' constraints soon

      // in the case of an addition we expect a positioned splice followed
      //  by a completion notification
      var deltaRep = DeltaHelper.peepExpDelta_added(lqt, newCinfo);
      this._ensureExpectedQuery(lqt);
    }
  },

  /**
   * Conversation activity has (possibly) affected a peep's indices OR the
   *  peep has joined a conversation and needs their number of conversations
   *  bumped. Generate expectations for the relevant queries if we believe
   *  ordering is affected or we are explicitly told there is another change.
   */
  _notifyPeepChanged: function(cinfo, knownChange) {
    // -- dependent (indirect) queries
    // queries that know about this peep for dependency reasons will also
    //  receive a notification
    this._notifyDepConvQueries(cinfo, cinfo.involvedConvs);

    // -- direct queries
    // ignore changes about our own peep for direct queries.
    // XXX should we filter ourselves out?
//    if (cinfo.name === this._testClient.__name)
//      return;

    var queries = this._dynamicPeepQueries;
    for (var iQuery = 0; iQuery < queries.length; iQuery++) {
      var lqt = queries[iQuery];

      // skip non-index queries (ex: new friends queries)
      if (!lqt._liveset.query.hasOwnProperty('by'))
        continue;
      // XXX we also need to discard based on 'pinned' constraints soon

      var deltaRep = DeltaHelper.peepExpMaybeDelta_newmsg(lqt, cinfo,
                                                          knownChange);
      if (deltaRep)
        this._ensureExpectedQuery(lqt);
    }

  },

// nop-ing out because I believe the timestamp changes cover this notification
//  as a side-effect, and I think we can cover the peep changed case with the
//  join case.
/*
  _notifyPeepJoinedConv: function(cinfo, convInfo) {
    var queries = this._dynamicPeepConvQueries;
    for (var iQuery = 0; iQuery < queries.length; iQuery++) {
      var lqt = queries[iQuery];

      // the query only cares if its dude is involved
      if (convInfo.participantInfos.indexOf(lqt.data.contactInfo) === -1)
        continue;

      var deltaRep = DeltaHelper.peepConvsExpDelta_joined(lqt, convInfo);
      this.RT.reportActiveActorThisStep(this);
      this.expect_queryCompleted(lqt.__name, deltaRep);
    }
  },
*/

  /**
   * Conversation activity has affected a conversation blurb's indices,
   *  generate expectations for the relevant queries if this has affected
   *  blurb ordering.
   */
  _notifyPeepConvTimestampsChanged: function(cinfo, convIndices, convInfo,
                                             joinOccurred) {
    var queries = this._dynamicPeepConvQueries;
    for (var iQuery = 0; iQuery < queries.length; iQuery++) {
      var lqt = queries[iQuery];

      // the query only cares if its dude is involved
      if (convInfo.participantInfos.indexOf(lqt.data.contactInfo) === -1)
        continue;

      var deltaRep = DeltaHelper.peepConvsExpMaybeDelta_newmsg(
        lqt, convInfo, joinOccurred);
      if (deltaRep)
        this._ensureExpectedQuery(lqt);
    }
  },

  _notifyConvGainedMessages: function(convInfo) {
    var queries = this._dynamicConvMsgsQueries, iQuery, lqt,
        backlog = convInfo.tConv.data.backlog,
        // these are all 1-based indices, so this works out.
        seenMsgs = backlog.slice(0, convInfo.highestMsgSeen),
        addedMsgs = backlog.slice(convInfo.highestMsgReported,
                                  convInfo.highestMsgSeen);
    convInfo.highestMsgReported = convInfo.highestMsgSeen;
    for (iQuery = 0; iQuery < queries.length; iQuery++) {
      lqt = queries[iQuery];

      // the query only cares if it's the same conversation it cares about
      if (convInfo.tConv !== lqt.data.tConv)
        continue;

      var deltaRep = DeltaHelper.convMsgsDelta_added(lqt, seenMsgs, addedMsgs);
      this._ensureExpectedQuery(lqt);
    }
  },

  /**
   * Generate dependent notifications about affected 'convblurbs' and 'convmsgs'
   *  queries given a list of affected conversations.
   *
   * @args[
   *   @param[source @oneof[DynamicContactInfo]]
   *   @param[@listof[DynamicConvInfo]]{
   *     The conversations the source is involved in and for which
   *     notifications should be generated.
   *   }
   * ]
   */
  _notifyDepConvQueries: function(source, touchesConvInfos) {
    // map the dynamic conversation info to the tConv reps
    var tConvs = [];
    for (var i = 0; i < touchesConvInfos.length; i++) {
      tConvs.push(touchesConvInfos[i].tConv);
    }

    // - convmsgs queries
    var queries = this._dynamicConvMsgsQueries, iQuery, lqt;
    for (iQuery = 0; iQuery < queries.length; iQuery++) {
      lqt = queries[iQuery];

      var idxAffected = tConvs.indexOf(lqt.data.tConv);
      if (idxAffected === -1)
        continue;

      var convInfo = touchesConvInfos[idxAffected],
          backlog = convInfo.tConv.data.backlog,
          // these are all 1-based indices, so this works out.
          seenMsgs = backlog.slice(0, convInfo.highestMsgSeen);
      var deltaRep = DeltaHelper.convMsgsDelta_nop(lqt, seenMsgs);
      this._ensureExpectedQuery(lqt);
    }

    // - convblurbs queries
    queries = this._dynamicPeepConvQueries;
    for (iQuery = 0; iQuery < queries.length; iQuery++) {
      lqt = queries[iQuery];

      // find if the query currently includes any of `touchesConvInfos`
      if (lqt._convs.some(function(x) {
                            return touchesConvInfos.indexOf(x) !== -1;
                          })) {
        // it does, give it a dependent dep.
        DeltaHelper.peepConvsDelta_nop(lqt);
        this._ensureExpectedQuery(lqt);
      }
    }
  },

  /**
   * Ensure that we have an expectation for a query at most once.  This is to
   *  match up with the notification king which only flushes query results
   *  when the update phase completes.  (All query-updating logic knows to
   *  update the pending representations rather than clobbering the state,
   *  so accumulated notifications should be fine.)  We keep the expected
   *  object around (on lqt._pendingExpDelta) so we can mutate that accordingly,
   *  and our __updatePhaseComplete implementation knows how to clean that out
   *  as well as our list we push onto here.
   */
  _ensureExpectedQuery: function(lqt) {
    if (this._dynPendingQueries.indexOf(lqt) !== -1)
      return;
    // put our actor into 'set' expectations mode for this step since the
    //  query ordering is proving to be intractable to mirror and we don't
    //  really care.
    this.RT.reportActiveActorThisStep(this);
    this.expectUseSetMatching();

    this._dynPendingQueries.push(lqt);
    this.expect_queryCompleted(lqt.__name, lqt._pendingExpDelta);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Notifications from testClient

  /**
   * Invoked during the test step where the connect request is released to the
   *  client.  All data structure manipulation should be on dynamic ones.
   */
  __receiveConnectRequest: function(other, messageText) {
    var nowSeq = this.RT.testDomainSeq;
    var reqInfo = {
      testClient: other,
      receivedAt: nowSeq,
      messageText: messageText,
    };
    this._dynConnReqInfos.push(reqInfo);
    this._notifyConnectRequest(reqInfo);
  },

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
      isUs: false,
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
      participantInfos: [],
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

    convInfo.highestMsgSeen++;

    var self = this;
    function goNotify(authorInfo, participantInfos, joineeInfo, forceUpdate) {
      var convAuthIndices = convInfo.peepSeqsByName[authorInfo.name],
          ourInfo = self._contactMetaInfoByName[self._testClient.__name];

      authorInfo.write = Math.max(authorInfo.write, tMsg.data.seq);
      authorInfo.any = Math.max(authorInfo.any, tMsg.data.seq);

      convAuthIndices.write = tMsg.data.seq;
      convAuthIndices.any = tMsg.data.seq;

      // - peep notifications
      // a change definitely occurred if they are joining the conv
      self._notifyPeepChanged(authorInfo, joineeInfo === authorInfo);

      var iPart, pinfo;
      for (iPart = 0; iPart < participantInfos.length; iPart++) {
        pinfo = participantInfos[iPart];
        // do not process the author again
        if (pinfo === authorInfo)
          continue;

        // recip is only updated for messages authored by our user.
        if (authorInfo === ourInfo)
          pinfo.recip = Math.max(pinfo.recip, tMsg.data.seq);
        pinfo.any = Math.max(pinfo.any, tMsg.data.seq);
        // a change definitely occurred if they are joining the conv
        self._notifyPeepChanged(pinfo, pinfo === joineeInfo);
      }

      // - conversation notifications
      self._notifyPeepConvTimestampsChanged(
        authorInfo, convAuthIndices, convInfo, forceUpdate || !!joineeInfo);
      for (iPart = 0; iPart < participantInfos.length; iPart++) {
        pinfo = participantInfos[iPart];
        // do not process the author again
        if (pinfo === authorInfo)
          continue;
        var convPartIndices = convInfo.peepSeqsByName[pinfo.name];

        if (authorInfo === ourInfo)
          convPartIndices.recip = tMsg.data.seq;
        convPartIndices.any = tMsg.data.seq;

        self._notifyPeepConvTimestampsChanged(
          pinfo, convPartIndices, convInfo, forceUpdate || !!joineeInfo);
      }
    }

    if (tMsg.data.type === 'message') {
      var authorInfo = this._contactMetaInfoByName[tMsg.data.author.__name];
      // force the update on messages because we are always sending blurb
      //  updates with the message as a possible firstMessage as a hack
      goNotify(authorInfo, convInfo.participantInfos, null, true);
    }
    else if (tMsg.data.type === 'join') {
      var joinerName = tMsg.data.inviter.__name,
          joinerInfo = this._contactMetaInfoByName[joinerName],
          joineeName = tMsg.data.who.__name,
          joineeInfo = this._contactMetaInfoByName[joineeName];
      convInfo.peepSeqsByName[joineeName] = {};

      joineeInfo.involvedConvs.push(convInfo);
      convInfo.participantInfos.push(joineeInfo);

      goNotify(joinerInfo, convInfo.participantInfos, joineeInfo);
    }
  },

  /**
   * Notification that a 'replicaCaughtUp' expectation is part of the current
   *  test step after all other moda notifications are generated.  This is
   *  generated because replicaCaughtUp gets passed through to
   *  `NotificationKing` which then uses it to decide to release any batched
   *  up convmsgs updates in a single batch.
   *
   * We used to be concerned about the ordering of the query results because the
   *  logging/testing framework was matching everything in an ordered fashion.
   *  We now put it in an unordered mode of event checking for steps where
   *  query completions happen, so we are less concerned.  However, it is still
   *  important that we only emit a single expectation per update phase (as the
   *  notification king does).  Accordingly, our code uses _ensureExpectedQuery
   *  to make sure we only queue the expectation once.  Our job in this method
   *  then becomes to clean out the state used by that function and its
   *  `DeltaHelper.makeOrReuseDelta` helper so that we generate new expectations
   *  next round.
   */
  __updatePhaseComplete: function() {
    // -- flush out pending message addition NS_CONVMSGS queries
    var pendingConvInfos = this._dynPendingConvMsgs;
    for (var iConv = 0; iConv < pendingConvInfos.length; iConv++) {
      var convInfo = pendingConvInfos[iConv];
      this._notifyConvGainedMessages(convInfo);
    }
    pendingConvInfos.splice(0, pendingConvInfos.length);

    // -- clear the delta on the pending query expectations
    var pendingExpQueries = this._dynPendingQueries;
    for (var i = 0; i < pendingExpQueries.length; i++) {
      pendingExpQueries[i]._pendingExpDelta = null;
    }
    pendingExpQueries.splice(0, pendingExpQueries.length);
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

    var keymapper, self = this;
    if (liveSet._ns === 'convmsgs') {
      keymapper = function(msg) {
        switch (msg.type) {
          case 'join':
            return 'join:' + msg.invitee.selfPoco.displayName;
          case 'message':
            return msg.author.selfPoco.displayName + ': ' + msg.text;
          default:
            throw new Error("Unknown message type '" + msg.type + "'");
        }
      };
    }
    else if (liveSet._ns === 'connreqs') {
      keymapper = function(connReq) {
        return connReq.peep.selfPoco.displayName + ': ' + connReq.messageText;
      };
    }
    else {
      keymapper = function(item) {
        return self._remapLocalToFullName(liveSet._ns, item._localName);
      };
    }

    // - removals
    // this happens prior to actually performing the splice on the set's items
    var iRemoved = index, highRemoved = index + howMany, rootKey;
    for (; iRemoved < highRemoved; iRemoved++) {
      // (this is dealing with the moda 'user' visible representations)
      rootKey = keymapper(liveSet.items[iRemoved]);
      delta.preAnno[rootKey] = -1;
    }

    // - additions
    for (var iAdded = 0; iAdded < addedItems.length; iAdded++) {
      // (this is dealing with the moda 'user' visible representations)
      rootKey = keymapper(addedItems[iAdded]);
      // if it was removed this cycle, we now know it's a move; remove the
      //  preAnno and don't add a postAnno.
      if (delta.preAnno.hasOwnProperty(rootKey))
        delete delta.preAnno[rootKey];
      else
        delta.postAnno[rootKey] = 1;
    }

    // (state population happens during the completed notification)

    // XXX implement this, very similar to logic in `client-db-views.js`, steal.
    //this._logger.queryUpdateSplice(liveSet.data.__name, deltaRep);
  },

  onCompleted: function(liveSet, modifiedDeps) {
    var lqt = liveSet.data, delta, rootKey;
    if (!lqt._pendingDelta)
      delta = lqt._pendingDelta = DeltaHelper.makeEmptyDelta();
    else
      delta = lqt._pendingDelta;

    var depMap = modifiedDeps.length ? {} : null;
    for (var iDep = 0; iDep < modifiedDeps.length; iDep++) {
      var depRep = modifiedDeps[iDep];
      depMap[this._remapLocalToFullName(depRep.__namespace,
                                        depRep._localName)] = true;
    }

    var keymapper, self = this;
    if (liveSet._ns === 'convmsgs') {
      keymapper = function(msg) {
        switch (msg.type) {
          case 'join':
            return 'join:' + msg.invitee.selfPoco.displayName;
          case 'message':
            return msg.author.selfPoco.displayName + ': ' + msg.text;
          default:
            throw new Error("Unknown mesasge type '" + msg.type + "'");
        }
      };
    }
    else if (liveSet._ns === 'connreqs') {
      keymapper = function(connReq) {
        return connReq.peep.selfPoco.displayName + ': ' + connReq.messageText;
      };
    }
    else {
      keymapper = function(item) {
        return self._remapLocalToFullName(liveSet._ns, item._localName);
      };
    }

    // - revised state
    var counter = 0;
    for (var i = 0; i < liveSet.items.length; i++) {
      rootKey = keymapper(liveSet.items[i]);
      delta.state[rootKey] = counter++;
    }

    this._logger.queryCompleted(liveSet.data.__name, delta, depMap);
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
    lqt._pendingExpDelta = null;

    this.T.action(this, 'create', lqt, function() {
      // -- generate the expectation
      // get and order the contact infos for generating the state; hold onto
      //  this.
      var delta = DeltaHelper.peepExpDelta_base(
                    lqt, self._getDynContactInfos(), query.by);
      self._ensureExpectedQuery(lqt);
      lqt._pendingExpDelta = null;

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
    lqt._pendingExpDelta = null;
    this.T.action(this, 'create', lqt, function() {
      var peep = self._grabPeepFromQueryUsingClient(usingQuery, peepClient),
          cinfo = self._lookupContactInfo(peepClient);

      var delta = DeltaHelper.peepConvsExpDelta_base(
        lqt, cinfo, self._dynamicConvInfos, query.by);
      self._ensureExpectedQuery(lqt);
      lqt._pendingExpDelta = null;

      lqt.data = {
        contactInfo: cinfo,
      };

      lqt._liveset = self._bridge.queryPeepConversations(peep, query,
                                                         self, lqt);
      self._dynamicPeepConvQueries.push(lqt);
    });

    return lqt;
  },

  do_queryConversations: function(query) {
    throw new Error("XXX no all-conversations query testing support yet");
  },

  do_queryConversationMessages: function(thingName, usingQuery, tConv) {
    var lqt = this.T.thing('livequery', thingName), self = this;
    lqt._pendingDelta = null;
    lqt._pendingExpDelta = null;
    this.T.action(this, 'create', lqt, function() {
      var convBlurb = self._grabConvBlurbFromQueryUsingConvThing(
                        usingQuery, tConv),
          convInfo = self._convInfoByName[tConv.__name],
          seenMsgs = tConv.data.backlog.slice(0, convInfo.highestMsgSeen);

      var delta = DeltaHelper.convMsgsDelta_base(lqt, seenMsgs);
      self.expect_queryCompleted(lqt.__name, delta);
      lqt._pendingExpDelta = null;

      lqt._liveset = self._bridge.queryConversationMessages(convBlurb,
                                                            self, lqt);
      lqt.data = {
        tConv: tConv,
      };

      self._dynamicConvMsgsQueries.push(lqt);
    });

    return lqt;
  },

  do_queryConnectRequests: function(thingName) {
    var lqt = this.T.thing('livequery', thingName), self = this;
    lqt._pendingDelta = null;
    lqt._pendingExpDelta = null;
    this.T.action(this, 'create', lqt, function() {
      var delta = DeltaHelper.connReqDelta_base(lqt, self._dynConnReqInfos);
      self.expect_queryCompleted(lqt.__name, delta);
      lqt._pendingExpDelta = null;

      lqt._liveset = self._bridge.queryConnectRequests(self, lqt);

      self._dynamicConnReqQueries.push(lqt);
    });

    return lqt;
  },

  //////////////////////////////////////////////////////////////////////////////
  // Queries: Issue Static Queries
  //
  // Things that use the query mechanism but aren't really updated because their
  // data source is once and done.

  /**
   * Issue the query for possible friends, with the caller providing the
   *  expected result list to simplify the logic here for now.  (This doesn't
   *  need to get tested all that much.)
   */
  do_queryPossibleFriends: function(thingName, expectedClients) {
    var lqt = this.T.thing('livequery', thingName), self = this;
    lqt._pendingDelta = null;
    lqt._pendingExpDelta = null;
    this.T.action('moda sends request for possible friends to', this._eBackside,
                  function() {
      self.holdAllModaCommands();
      self.expectModaCommand('queryMakeNewFriends');

      lqt._liveset = self._bridge.queryAllKnownServersForPeeps(self, lqt);
      self._dynamicPeepQueries.push(lqt);
    });
    this.T.action(this._eBackside,
                  'processes friend query request, invokes on',
                  this._testClient._eRawClient,
                  ', and LOTS of stuff happens, then', this,
                  'hears the results',
                  function() {
      // XXX WAY TOO MUCH STUFF HAPPENS IN THIS STEP, AND WITHOUT EXPECTATIONS.
      // The only real harm apart from a giant mish-mash of entries in the output
      //  is that the death of connections could spill over into the next step
      //  which could be confusing.  From a correctness perspective, our results
      //  expectation should be sufficient.
      var delta = DeltaHelper.peepExpStaticDelta(lqt, expectedClients);
      self.expect_queryCompleted(lqt.__name, delta);
      lqt._pendingExpDelta = null;

      self.releaseAndPeekAtModaCommand('queryMakeNewFriends');
      self.stopHoldingAndAssertNoHeldModaCommands();
    });

    return lqt;
  },

  //////////////////////////////////////////////////////////////////////////////
  // Queries: Kill

  _assertRemoveFromList: function(list, thing) {
    var idx = list.indexOf(thing);
    if (idx === -1)
      throw new Error("Thing not in list");
    list.splice(idx, 1);
  },

  /**
   * Unsubscribe a live query and forget about it.  We structure our listeners
   *  so that if the live query logic screws up and keeps sending us events
   *  we will throw up errors.
   */
  do_killQuery: function(lqt) {
    var self = this;
    this.T.action('close query', lqt, function() {
      // - remove from our list of queries
      switch (lqt._liveset._ns) {
        case 'peeps':
          self._assertRemoveFromList(self._dynamicPeepQueries, lqt);
          break;
        case 'convblurbs':
          self._assertRemoveFromList(self._dynamicPeepConvQueries, lqt);
          break;
        case 'convmsgs':
          self._assertRemoveFromList(self._dynamicConvMsgsQueries, lqt);
          break;
        case 'connreqs':
          self._assertRemoveFromList(self._dynamicConnReqQueries, lqt);
          break;

        case 'servers':
          throw new Error(
            "XXX we don't test the servers queries right about now");
      }

      // - close the query
      lqt._liveset.close();
    });
  },

  //////////////////////////////////////////////////////////////////////////////
  // Query Content Assertions

  _peepBlurbToLoggable: function(peep) {
    return {
      ourPoco: peep.ourPoco,
      selfPoco: peep.selfPoco,
      // XXX numUnread is beyond our abilities right now...
      numConvs: peep._numConvs,
    };
  },
  _msgBlurbToLoggable: function(msg) {
    if (!msg)
      return msg;
    if (msg.type === 'join') {
      return {
        type: 'join',
        inviter: this._peepBlurbToLoggable(msg.inviter),
        invitee: this._peepBlurbToLoggable(msg.invitee),
        // no receivedAt, we don't track that through the test framework,
        //  although we could certainly attach it once it gets to rawclient...
      };
    }
    else if (msg.type === 'message') {
      return {
        type: 'message',
        author: this._peepBlurbToLoggable(msg.author),
        // no composedAt/receivedAt, same logic as for join.
        text: msg.text,
      };
    }
    else {
      throw new Error("Unable to convert message type: " + msg.type);
    }
  },
  _convBlurbToLoggable: function(blurb) {
    return {
      participants: blurb.participants.map(this._peepBlurbToLoggable),
      firstMessage: this._msgBlurbToLoggable(blurb.firstMessage),
      // XXX no unread stuff yet
      //firstUnreadMessage: this._msgBlurbToLoggable(blurb.firstUnreadMessage),
      // XXX no pinned stuff yet
      //pinned: blurb._pinned,
    };
  },

  _clientInfoToLoggable: function(testClient) {
    var cinfo = this._contactMetaInfoByName[testClient.__name];
    return this._dynContactInfoToLoggable(cinfo);
  },
  _dynContactInfoToLoggable: function(cinfo) {
    if (!cinfo)
      return cinfo;
    return {
      ourPoco: {
        displayName: cinfo.name,
      },
      selfPoco: {
        displayName: cinfo.name,
      },
      numConvs: cinfo.involvedConvs.length,
    };
  },
  _thingMsgToLoggable: function(tMsg) {
    if (!tMsg)
      return tMsg;
    var dmsg = tMsg.data;
    if (dmsg.type === 'join') {
      return {
        type: 'join',
        inviter: this._clientInfoToLoggable(dmsg.inviter),
        invitee: this._clientInfoToLoggable(dmsg.who),
      };
    }
    else if (dmsg.type === 'message') {
      return {
        type: 'message',
        author: this._clientInfoToLoggable(dmsg.author),
        text: dmsg.text,
      };
    }
    else {
      throw new Error("Unable to convert thing message type: " + dmsg.type);
    }
  },
  _thingConvToBlurbLoggable: function(tConv) {
    var convInfo = this._convInfoByName[tConv.__name];

    var seenMsgs = tConv.data.backlog.slice(0, convInfo.highestMsgSeen);
    var firstThingMsg = null;
    for (var i = 0; i < seenMsgs.length; i++) {
      if (seenMsgs[i].data.type === 'message') {
        firstThingMsg = seenMsgs[i];
        break;
      }
    }

    return {
      participants: convInfo.participantInfos.map(
                      this._dynContactInfoToLoggable.bind(this)),
      firstMessage: this._thingMsgToLoggable(firstThingMsg),
      // XXX no pinned stuff yet
    };
  },

  check_queryContainsConvBlurbs: function(lqt, tConvs) {
    var self = this;
    this.T.check(this, 'checks', lqt, 'contains', tConvs, function() {
      var blurbs = lqt._liveset.items;
      if (blurbs.length !== tConvs.length)
        throw new Error("Have " + blurbs.length + " conv blurbs but " +
                        tConvs.length + " conv things.");
      for (var i = 0; i < blurbs.length; i++) {
        var blurb = blurbs[i], tConv = tConvs[i];
        self.expect_convBlurbCheck(self._thingConvToBlurbLoggable(tConv));
        self._logger.convBlurbCheck(self._convBlurbToLoggable(blurb));
        if (blurb.firstMessage.text === undefined)
          self._logger.messageInvariantViolated("text should not be undefined");
      }
    });
  },

  //////////////////////////////////////////////////////////////////////////////
  // Query Lookup Helpers

  _grabPeepFromQueryUsingClient: function(lqt, testClient) {
    var items = lqt._liveset.items, i;

    if (lqt._liveset._ns === 'connreqs') {
      for (i = 0; i < items.length; i++) {
        if (items[i].peep.selfPoco.displayName === testClient.__name)
          return items[i].peep;
      }
    }
    else {
      for (i = 0; i < items.length; i++) {
        if (items[i].selfPoco.displayName === testClient.__name)
          return items[i];
      }
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
        firstMessageText = tConv.data.firstMessage.data.text;
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
   * Trigger signup with a server using the moda API.  We have the servers
   *  cram their self-ident blobs into the list of known servers during their
   *  initialization, so then we can issue a query on the list of servers and
   *  use that to identify the right handle to use and then use that.
   */
  setup_useServer: function setup_useServer(testServer) {
    var self = this, me, servers;
    // it is very important to update the static server info on the test client!
    self._testClient._usingServer = testServer;
    this.T.convenienceSetup(self, 'asks whoAmI', function() {
      self.expect_whoAmI({displayName: self._testClient.__name}, null);
      me = self._bridge.whoAmI({
        onCompleted: function() {
          self._logger.whoAmI(me.poco,
                              me.usingServer && me.usingServer.url);
        },
      });
    });
    this.T.convenienceSetup(self, 'asks for the list of servers', function() {
      self.expect_serverQueryCompleted();
      servers = self._bridge.queryServers({
        onCompleted: function() {
          self._logger.serverQueryCompleted();
        },
      });
    });
    this.T.convenienceSetup(self, 'triggers signup with the server',
                            function() {
      for (var i = 0; i < servers.items.length; i++) {
        var modaServer = servers.items[i];
        if (modaServer.displayName === testServer.__name) {
          self.expect_signupResult(null);
          self.RT.reportActiveActorThisStep(self._testClient._eRawClient);
          self._testClient._eRawClient
            .expect_signup_begin()
            .expect_signedUp()
            .expect_signup_end();

          me.signupWithServer(modaServer, {
            onCompleted: function(err) {
              self._logger.signupResult(err);
            }
          });
          return;
        }
      }
      throw new Error("No server info for '" + testServer.__name +
                      "' found!");
    });
    // make sure that if we refresh the whoAmI call that we get the updated
    //  server info.
    this.T.convenienceSetup(self, 'checks post-signup whoAmI', function() {
      self.expect_whoAmI({displayName: self._testClient.__name},
                          testServer.__url);
      me = self._bridge.whoAmI({
        onCompleted: function() {
          self._logger.whoAmI(me.poco,
                              me.usingServer && me.usingServer.url);
        },
      });
    });
  },

  /**
   * Generate a connect request to another peep.  If the other peep has already
   *  requested to connect to us then this will complete the circuit.  Most of
   *  this is on the testClient testhelper, including figuring out which of the
   *  connect cases it is.
   */
  do_connectToPeep: function(usingPeepQuery, other, interesting) {
    var self = this,
        messageText = 'Friend Me Because... ' + fakeDataMaker.makeSubject(),
        closesLoop = this._testClient._dohelp_closesConnReqLoop(other);
    this.T.action('moda sends connectToPeep to', this._eBackside,
                  function() {
      self.holdAllModaCommands();
      self.expectModaCommand('connectToPeep');

      var peep = self._grabPeepFromQueryUsingClient(usingPeepQuery, other);
      self._bridge.connectToPeep(peep, peep.selfPoco, messageText);
    });
    this.T.action(this._eBackside, 'processes connectToPeep, invokes on',
                  this._testClient._eRawClient, function() {
      self._testClient._expect_contactRequest_prep(other, closesLoop);
      self._testClient._expect_contactRequest_issued(other,
        self.releaseAndPeekAtModaCommand('connectToPeep'));
      self.stopHoldingAndAssertNoHeldModaCommands();
    });
    this._testClient._expdo_contactRequest_everything_else(
      other, messageText, interesting);
  },

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

  do_inviteToConversation: function(usingPeepQuery, invitedTestClient,
                                    tConv, usingConvQuery) {
    tConv.sdata.participants.push(invitedTestClient);
    var tJoin = this.T.thing('message', 'join ' + invitedTestClient.__name);

    var self = this;
    // - moda api transmission to bridge
    this.T.action('moda sends inviteToConv to', this._eBackside, function() {
      self.holdAllModaCommands();
      self.expectModaCommand('inviteToConv');

      var convBlurb = self._grabConvBlurbFromQueryUsingConvThing(usingConvQuery,
                                                                 tConv);
      convBlurb.inviteToConversation(
        self._grabPeepFromQueryUsingClient(usingPeepQuery,
                                           invitedTestClient));
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
      // - signup related
      whoAmI: {poco: true, serverUrl: true},
      serverQueryCompleted: {},
      signupResult: {err: true},

      // - do_query* helpers (does not cover servers right now)
      queryCompleted: { name: true, state: true, depMap: false },

      // - query contents detailed results checkers (delta rep is very terse)
      convBlurbCheck: { blurbRep: true },

      // - wrapper holds for the backside
      backsideReceived: { cmd: true },
    },

    errors: {
      mootedMessageReceived: { msg: false },
      messageInvariantViolated: { msg: false },
    }
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
