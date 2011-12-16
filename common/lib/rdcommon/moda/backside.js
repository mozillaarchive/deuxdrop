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
 * Implements the moda worker-thread logic that handles communicating with the
 *  mailstore server and local storage of data on the device.  It has a
 *  reference to the rawclient instance and exposes it to the UI thread which
 *  uses the `ModaBridge` exposed API.
 *
 * Note that depending on the execution model, this logic may actually be
 *  time-sliced with the ui-thread logic.  Additionally, even if this logic does
 *  end up in a worker thread, it may have to rely on the UI-thread for all
 *  of its I/O.  This will be required on Firefox, at least until WebSockets and
 *  IndexedDB get exposed to workers.
 **/

define(
  [
    'q',
    'rdcommon/log',
    'rdcommon/serverlist',
    'rdcommon/identities/pubident', 'rdcommon/crypto/pubring',
    'module',
    'exports'
  ],
  function(
    $Q,
    $log,
    $serverlist,
    $pubident, $pubring,
    $module,
    exports
  ) {
const when = $Q.when;

const NS_PEEPS = 'peeps',
      NS_CONVBLURBS = 'convblurbs',
      NS_CONVMSGS = 'convmsgs',
      NS_SERVERS = 'servers',
      NS_POSSFRIENDS = 'possfriends',
      NS_CONNREQS = 'connreqs',
      NS_ERRORS = 'errors';

/**
 * The other side of a ModaBridge instance/connection.  This is intended to be
 *  a reasonably lightweight layer on top
 *
 * @args[
 *   @param[rawClient RawClientAPI]
 *   @param[name String]{
 *     A unique string amongst all other ModaBackside instances trying to
 *     talk to the same `RawClientAPI`/`NotificationKing` instance.  Normally
 *     the rendezvous logic would allocate these id's.
 *   }
 *   @param[_logger Logger]
 * ]
 */
function ModaBackside(rawClient, name, _logger) {
  this.name = name;
  this._log = LOGFAB.modaBackside(this, _logger, name);
  this._rawClient = rawClient;
  this._store = rawClient.store;
  this._notif = this._store._notif;

  this._bridgeName = null;
  this._sendObjFunc = null;

  this._querySource = this._notif.registerNewQuerySource(name, this);

  var self = this;
}
exports.ModaBackside = ModaBackside;
ModaBackside.prototype = {
  toString: function() {
    return '[ModaBackside]';
  },
  toJSON: function() {
    return {type: 'ModaBackside'};
  },

  /**
   * Hack to establish a *fake* *magic* link between us and a bridge.  ONLY
   *  FOR USE BY UNIT TESTS.
   */
  XXXcreateBridgeChannel: function(bridgeHandlerFunc, nextTickFunc) {
    this._bridgeName = this.name;
    var self = this;
    this._sendObjFunc = function(msg) {
      // it's important we don't actually call this until next round if we want
      //  to avoid weird ordering things happening in unit tests.
      nextTickFunc(function() {
        try {
          var jsonRoundtripped = JSON.parse(JSON.stringify(msg));
          bridgeHandlerFunc(jsonRoundtripped);
        }
        catch (ex) {
          self._log.sendFailure(ex);
        }
      });
    };

    return this._received.bind(this);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Lifecycle

  /**
   * Indicate that the other side is dead and we should kill off any live
   *  queries, etc.
   */
  dead: function() {
    this._notif.unregisterQuerySource(this.name);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Send to the ModaBridge from the NotificationKing

  send: function(msg) {
    this._log.send(msg);
    this._sendObjFunc(msg);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Receive from the ModaBridge, boss around NotificationKing, LocalStore

  /**
   * Handle messages from the `ModaBridge`, re-dispatching to helper methods
   *  named like "_cmd_COMMANDNAME".
   */
  _received: function(boxedObj) {
    // XXX this is indirection for unit testing purposes because _received gets
    //  wrapped directly.  I feel bad about this, I swear.
    return this._handle(boxedObj);
  },

  _handle: function(boxedObj) {
    var cmdFunc = this['_cmd_' + boxedObj.cmd];
    var rval = this._log.handle(boxedObj.cmd, this, cmdFunc, boxedObj.name,
                                boxedObj.payload);
    // if an exception gets thrown, it's a safe bet the query is doomed.
    if (rval instanceof Error) {
      // XXX ask the notification king to turn boxedObj.name into a handle
      //  so we can send a 'dead' notification across.
      // (it's okay to punt on this right now as the error will get logged
      //  and unit tests will see it and logging will detect the exception,
      //  etc.)
    }

    return rval;
  },

  _cmd_connect: function() {
    this._rawClient.connect();
  },

  _cmd_disconnect: function() {
    this._rawClient.disconnect();
  },

  _cmd_connectToPeep: function(_ignored, payload) {
    var clientData = this._notif.mapLocalNameToClientData(
                       this._querySource, NS_PEEPS, payload.peepLocalName);
    this._rawClient.connectToPeepUsingSelfIdent(clientData.data.sident,
                                                payload.localPoco,
                                                payload.messageText);
  },

  _cmd_rejectConnectRequest: function(_ignored, payload) {
    var reqData = this._notif.mapLocalNameToClientData(
                    this._querySource, NS_CONNREQS, payload.localName),
        peepData = reqData.deps[0],
        pubring = $pubring.createPersonPubringFromSelfIdentDO_NOT_VERIFY(
                    peepData.data.sident);

    this._rawClient.rejectConnectRequest(
      pubring.rootPublicKey, pubring.getPublicKeyFor('messaging', 'tellBox'),
      reqData.data.receivedAt, payload.reportAs);
  },

  _cmd_createConversation: function(_ignored, convData) {
    var peepOIdents = [], peepPubrings = [];
    for (var iPeep = 0; iPeep < convData.peeps.length; iPeep++) {
      var peepOurData = this._notif.mapLocalNameToClientData(
                             this._querySource, NS_PEEPS,
                             convData.peeps[iPeep]).data;
      if (!peepOurData.oident)
        throw new Error("Impossible to invite a non-contact peep to a conv");
      peepOIdents.push(peepOurData.oident);
      peepPubrings.push($pubring.createPersonPubringFromSelfIdentDO_NOT_VERIFY(
                          peepOurData.sident));
    }
    var convCreationInfo = this._rawClient.createConversation(
                             peepOIdents, peepPubrings, convData.messageText);

    // nb: we are returning this for testing purposes; we return this so that
    //  _received can in turn return it, allowing a testwrapper-interposed
    //  wrapper to get the return value of the release.
    return convCreationInfo;
  },

  _cmd_replyToConv: function(convLocalName, msgData) {
    var convMeta = this._notif.mapLocalNameToClientData(
                     this._querySource, NS_CONVBLURBS, convLocalName).data.meta;
    // returned for testing purposes (see createConversation)
    return this._rawClient.replyToConversation(convMeta, msgData.messageText);
  },

  _cmd_inviteToConv: function(convLocalName, invData) {
    var convMeta = this._notif.mapLocalNameToClientData(
                     this._querySource, NS_CONVBLURBS, convLocalName).data.meta;
    var peepOurData = this._notif.mapLocalNameToClientData(
                           this._querySource, NS_PEEPS, invData.peepName).data;
    if (!peepOurData.oident)
      throw new Error("Impossible to invite a non-contact peep to a conv");

    // returned for testing purposes (see createConversation)
    return this._rawClient.inviteToConversation(
      convMeta,
      peepOurData.oident,
      $pubring.createPersonPubringFromSelfIdentDO_NOT_VERIFY(
        peepOurData.sident));
  },

  _cmd_publishConvUserMetaDelta: function(convLocalName, userMetaDelta) {
    var convClientData = this._notif.mapLocalNameToClientData(
                           this._querySource, NS_CONVBLURBS, convLocalName);
    var curMeta = convClientData.data.pubMeta,
        anyChange = false;
    for (var key in userMetaDelta) {
      switch (key) {
        case 'lastRead':
          var newlyRead = this._notif.mapLocalNameToClientData(
                            this._querySource, NS_CONVMSGS,
                            userMetaDelta.lastRead).data.index;
          if (newlyRead !== curMeta.lastRead) {
            curMeta.lastRead = newlyRead;
            anyChange = true;
          }
          break;
        default:
          // ignore things not specifically understood for now
          break;
      }
    }

    // if there was no change, just eat this request
    if (!anyChange)
      return null;
    return this._rawClient.publishConvUserMeta(convClientData.data.meta,
                                               curMeta);
  },

  _cmd_cloneQuery: function(clonedQueryName, sourceQueryInfo) {
    var ns = sourceQueryInfo.ns, sliced = sourceQueryInfo.sliced,
        querySource = this._querySource;
    var queryHandle = this._notif.newTrackedQuery(
                        querySource, clonedQueryName, ns, 'CLONE');

    // we need a test function that only returns true for already present items
    queryHandle.testFunc = function(baseCells, mutatedCells, fullName) {
      for (var i = 0; i < queryHandle.items.length; i++) {
        if (queryHandle.items[i].fullName === fullName)
          return true;
      }
      return false;
    };

    // now go through the list of sliced items and mark them as deps
    for (var iSliced = 0; iSliced < sliced.length; iSliced++) {
      var localName = sliced[iSliced];
      var clientData = this._notif.reuseIfAlreadyKnown(
        querySource, ns,
        this._notif.mapLocalNameToFullName(querySource, ns, localName));
      queryHandle.items.push(clientData);
    }
    this.send({
      type: 'cloneQueryAck',
      handle: queryHandle.uniqueId,
      source: sourceQueryInfo.source,
    });
  },

  /**
   * In the event that we encounter a problem procesing a query, we should
   *  remove it from our tracking mechanism and report to the other side that
   *  we failed and will not be providing any responses.
   */
  _needsbind_queryProblem: function(queryHandle, err) {
    this._log.queryProblem(err);
    this._notif.forgetTrackedQuery(queryHandle);
    this.send({
      type: 'query',
      handle: queryHandle.uniqueId,
      op: 'dead',
    });
  },

  _cmd_queryPeeps: function(bridgeQueryName, queryDef) {
    var queryHandle = this._notif.newTrackedQuery(
                        this._querySource, bridgeQueryName,
                        NS_PEEPS, queryDef);
    when(this._store.queryAndWatchPeepBlurbs(queryHandle), null,
         this._needsbind_queryProblem.bind(this, queryHandle));
  },

  _cmd_queryPeepConversations: function(bridgeQueryName, payload) {
    var queryHandle = this._notif.newTrackedQuery(
                        this._querySource, bridgeQueryName,
                        NS_CONVBLURBS, payload.query);
    // map the provided peep local name to z true name
    var peepRootKey = this._notif.mapLocalNameToFullName(this._querySource,
                                                         NS_PEEPS,
                                                         payload.peep);
    when(this._store.queryAndWatchPeepConversationBlurbs(queryHandle,
                                                         peepRootKey,
                                                         payload.query),
         null,
         this._needsbind_queryProblem.bind(this, queryHandle));
  },

  _cmd_queryAllConversations: function(bridgeQueryName, payload) {
    var queryHandle = this._notif.newTrackedQuery(
                        this._querySource, bridgeQueryName,
                        NS_CONVBLURBS, payload.query);
    when(this._store.queryAndWatchAllConversationBlurbs(queryHandle,
                                                        payload.query),
         null,
         this._needsbind_queryProblem.bind(this, queryHandle));
  },

  _cmd_queryConvMsgs: function(bridgeQueryName, payload) {
    // map the provided conv blurb local name to the true name
    var convId = this._notif.mapLocalNameToFullName(this._querySource,
                                                    NS_CONVBLURBS,
                                                    payload.localName);
    var queryDef = {
      convId: convId,
    };
    var queryHandle = this._notif.newTrackedQuery(
                        this._querySource, bridgeQueryName,
                        NS_CONVMSGS, queryDef);
    when(this._store.queryConversationMessages(queryHandle, convId),
         null,
         this._needsbind_queryProblem.bind(this, queryHandle));
  },

  /**
   * Get a list of all known servers.
   */
  _cmd_queryServers: function(bridgeQueryName, payload) {
    var querySource = this._querySource,
        queryHandle = this._notif.newTrackedQuery(
                        querySource, bridgeQueryName,
                        NS_SERVERS, payload.query);

    var viewItems = [], clientDataItems = null;
    queryHandle.items = clientDataItems = [];
    queryHandle.splices.push({index: 0, howMany: 0, items: viewItems});

    var serverIdentBlobs = $serverlist.serverSelfIdents;
    for (var iServer = 0; iServer < serverIdentBlobs.length; iServer++) {
      var serverIdentBlob = serverIdentBlobs[iServer].selfIdent;
      var serverIdent = $pubident.assertGetServerSelfIdent(serverIdentBlob);

      var clientData = this._notif.reuseIfAlreadyKnown(querySource,
                                                       NS_SERVERS,
                                                       serverIdent.rootPublicKey);
      if (!clientData)
        clientData = this._store._convertServerInfo(
                       querySource, serverIdent, serverIdentBlob);
      viewItems.push(clientData.localName);
      clientDataItems.push(clientData);
    }
    this._notif.sendQueryResults(queryHandle);
  },

  _cmd_queryPossibleFriends: function(bridgeQueryName) {
    var querySource = this._querySource,
        queryHandle = this._notif.newTrackedQuery(
                        querySource, bridgeQueryName,
                        NS_POSSFRIENDS, {}),
        self = this;

    // note: they come back sorted by display name already
    when(this._rawClient.queryServerForPossibleFriends(queryHandle),
      function resolved(blobsAndPayloads) {
        var viewItems = [];
        for (var i = 0; i < blobsAndPayloads.length; i++) {
          var blobAndPayload = blobsAndPayloads[i],
              selfIdentBlob = blobAndPayload.blob,
              selfIdentPayload = blobAndPayload.payload,
              fullName = selfIdentPayload.root.rootSignPubKey;

          var peepClientData = self._store._convertSynthPeep(
                                 querySource, fullName, selfIdentBlob,
                                 selfIdentPayload);

          var clientData = self._notif.generateClientData(
                             querySource, NS_POSSFRIENDS, fullName);
          clientData.deps.push(peepClientData);
          querySource.dataMap[NS_POSSFRIENDS][clientData.localName] = {
            peepLocalName: peepClientData.localName
          };

          viewItems.push(clientData.localName);
          queryHandle.items.push(clientData);
        }

        queryHandle.splices.push(
          { index: 0, howMany: 0, items: viewItems });

        // no dep analysis is required, these are just peeps
        self._notif.sendQueryResults(queryHandle);
      },
      function rejected(err) {
        // Although something bad happened, let's pretend like we just didn't
        //  get any results.  we should probably sideband an error message to
        //  the UI though.
        self._notif.sendQueryResults(queryHandle);
      });
  },

  _cmd_queryConnRequests: function(bridgeQueryName) {
    var queryHandle = this._notif.newTrackedQuery(
                        this._querySource, bridgeQueryName,
                        NS_CONNREQS, {});
    when(this._store.queryAndWatchConnRequests(queryHandle), null,
         this._needsbind_queryProblem.bind(this, queryHandle));
  },

  _cmd_queryErrors: function(bridgeQueryName, queryDef) {
    var queryHandle = this._notif.newTrackedQuery(
                        this._querySource, bridgeQueryName,
                        NS_ERRORS, {});
    when(this._rawClient.queryAndWatchErrors(queryHandle), null,
         this._needsbind_queryProblem.bind(this, queryHandle));
  },

  _cmd_killQuery: function(bridgeQueryName, namespace) {
    var queryHandle = this._notif.getQueryHandleByUniqueId(this._querySource,
                                                           namespace,
                                                           bridgeQueryName);
    this._notif.forgetTrackedQuery(queryHandle);
  },

  _cmd_whoAmI: function() {
    var serverInfo = null;
    // XXX our use of serverInfo needs to integrate with the caching scheme
    //  for consistency here!
    if (this._rawClient._transitServerBlob)
      serverInfo = this._store._transformServerIdent(
                     this._rawClient._transitServer);
    this.send({
      type: 'whoAmI',
      poco: this._rawClient.getPoco(),
      server: serverInfo,
      selfIdentBlob: this._rawClient.getSelfIdentBlob(),
      clientPublicKey: this._rawClient.clientPublicKey,
    });
  },

  _cmd_updatePoco: function(_ignored, newPoco) {
    this._rawClient.updatePoco(newPoco);
  },

  updatePocoWithPartial: function(partialPoco) {
    var poco = this._rawClient.getPoco();
    for (var prop in partialPoco) {
      if (partialPoco.hasOwnProperty(prop)) {
        poco[prop] = partialPoco[prop];
      }
    }

    this._rawClient.updatePoco(poco);
  },

  _cmd_provideProofOfIdentity: function(_ignored, proof) {
    this._rawClient.provideProofOfIdentity(proof);
  },

  _cmd_insecureServerDomainQuery: function(bridgeQueryName, query) {
    var querySource = this._querySource,
        queryHandle = this._notif.newTrackedQuery(
                        querySource, bridgeQueryName,
                        NS_SERVERS, query),
        viewItems = [],
        clientDataItems = queryHandle.items = [], self = this;
    queryHandle.splices.push({ index: 0, howMany: 0, items: viewItems });

    when(this._rawClient.insecurelyGetServerSelfIdentUsingDomainName(
           query.domain),
      function (selfIdentInfo) {
        var serverInfo = null;

        if (selfIdentInfo) {
          var serverIdentBlob = selfIdentInfo.selfIdent;
          var serverIdent = $pubident.assertGetServerSelfIdent(serverIdentBlob);

          var clientData = self._store._convertServerInfo(
                             querySource, serverIdent, serverIdentBlob);
          viewItems.push(clientData.localName);
          clientDataItems.push(clientData);
        }

        // no dep analysis is required, just the one server
        self._notif.sendQueryResults(queryHandle);
      },
      function rejected(err) {
        // return an empty result set to convey errors. sorta jerky.
        self._notif.sendQueryResults(queryHandle);
      }
    );
  },

  _cmd_signup: function(_ignored, serverLocalName) {
    // the clientData data is just the self ident blob.
    var serverSelfIdentBlob =
      this._notif.mapLocalNameToClientData(
        this._querySource, NS_SERVERS, serverLocalName).data;

    var self = this;
    when(this._rawClient.signupUsingServerSelfIdent(serverSelfIdentBlob),
      // the signup process converts rejections to resolutions, so 'err' may
      //  vary here.
      function resolved(err) {
        self.send({
          type: 'signupResult',
          err: err,
        });
      },
      // XXX and this is sorta not needed unless one of those handlers throws.
      function rejected(err) {
        self.send({
          type: 'signupResult',
          err: err,
        });
      });
  },

  //////////////////////////////////////////////////////////////////////////////
};

var LOGFAB = exports.LOGFAB = $log.register($module, {
  modaBackside: {
    type: $log.DAEMON,
    subtype: $log.DAEMON,
    calls: {
      handle: {cmd: true},
    },
    TEST_ONLY_calls: {
      handle: {name: true, payload: false},
    },
    events: {
      send: {},
    },
    TEST_ONLY_events: {
      send: {msg: false},
    },
    errors: {
      queryProblem: {ex: $log.EXCEPTION},
      sendFailure: {ex: $log.EXCEPTION},
    },
  },
});

}); // end define
