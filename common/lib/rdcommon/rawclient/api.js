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
 * The raw client provides reliable low level interaction with a mailstore
 *  server while abstracting away key management concerns.  It is intended to
 *  exist on a background (non-UI) thread on the client device.  Interaction
 *  with the UI thread should be handled at a higher level that is aware of the
 *  UI's current "focus".
 *
 * "Reliable" in this sense means that the consumer of the API does not need to
 *  build its own layer to make sure we do the things it asks.  At the current
 *  time, we in fact do not bother persisting anything, but at some point we
 *  will.
 *
 * The raw client is not responsible for persisting/caching anything (at this
 *  time), although it does maintain a blob of internal state that it will
 *  provide for the client to persist its state and to give it when creating
 *  a new instance of the client API.
 **/

define(
  [
    'rdcommon/log',
    'rdcommon/transport/authconn',
    'rdcommon/crypto/keyring',
    'rdcommon/identities/pubident',
    '../conversations/generator',
    'module',
    'exports'
  ],
  function(
    $log,
    $authconn,
    $keyring,
    $pubident,
    $conv_generator,
    $module,
    exports
  ) {

function ClientSignupConn(selfIdentBundle, clientIdentPayload, clientAuths,
                    serverSelfIdentPayload) {
  this.conn = new $authconn.AuthClientConn(
                this,
                clientIdent.publicKey,
                serverSelfIdentPayload.boxPubKey,
                serverSelfIdentPayload.url,
                'signup/signup');

}
ClientSignupConn.prototype = {
  INITIAL_STATE: 'root',
  /**
   * When we've connected, send our request.
   */
  __connected: function() {
    this.conn.writeMessage({
      type: 'signup',

    });
  },

  /**
   * They did not like our signup, try again...
   */
  _msg_root_challenge: function() {
  },

  /**
   * We are now signed up! Woo!
   */
  _msg_root_signedUp: function() {
  },
};

/**
 *
 * For the time being, we are assuming the client always has all sets of
 *  its keyrings accessible to itself.
 */
function RawClientAPI(persistedBlob) {
  // -- restore keyrings
  this._rootKeyring = $keyring.loadPersonRootSigningKeyring(
                        persistedBlob.keyrings.root);
  this._longtermKeyring = $keyring.loadLongtermSigningKeyring(
                            persistedBlob.keyrings.longterm);
  this._keyring = $keyring.loadDelegatedKeyring(
                             persistedBlob.keyrings.general);

  // -- copy self-ident-blob, verify it, extract canon bits
  // (The poco bit is coming from here.)
  this._selfIdentBlob = persistedBlob.selfIdent;

  this.log = LOGFAB.rawClient(this, null,
                              []);
}
RawClientAPI.prototype = {
  //////////////////////////////////////////////////////////////////////////////
  // Server Signup

  /**
   * Connect to the server and ask it for its self-ident, then go from there.
   *  While this admittedly is a pretty bad idea, it's not as bad as it seems
   *  since in order for them to maintain a useful man-in-the-middle attack
   *  where the system looks like it is operating successfully while they can
   *  see everything, they need to:
   *
   * - Consistently intercept and respond to the client's requests to talk to
   *    the faux-server.  (Assuming we do error reporting correctly that we
   *    notice when our connections end up talking to the wrong server...)
   *
   * - Be the sole source for all key/identity information for the user.
   *
   * Better ideas where we can leverage existing crypto trust-chains that the
   *  user/device may already have include depending on the HTTPS/CA system or
   *  DNSSEC.  Mo better ideas include not using this method at all and instead
   *  using mobile-device to mobile-device chat to provide the self-ident.
   */
  signupDangerouslyUsingDomainName: function() {
  },

  signupUsingServerSelfIdent: function() {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Request Querying

  // email/time
  queryRequests: function() {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Peep Mutation

  connectToPeep: function(email, optionalMessage) {
  },
  rejectPeep: function(email, reportAs) {
  },

  pinPeep: function() {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Peep Querying

  // all/pinned, time-ordered/alphabetical
  queryPeeps: function() {
  },


  //////////////////////////////////////////////////////////////////////////////
  // Conversation Mutation

  createConversation: function() {
  },
  replyToConversation: function() {
  },
  inviteToConversation: function() {
  },

  pinConversation: function() {
  },
  updateWatermarkForConversation: function() {
  },

  deleteConversation: function() {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Conversation Querying

  // involving-peep/all-peeps, time-ordered, pinned...
  queryConversations: function() {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Persist client state
  __persist: function() {
    return {
      keyrings: {
        root: this._rootKeyring.data,
        longterm: this._longtermKeyring.data,
        general: this._keyring.data,
      }
    };
  },

  //////////////////////////////////////////////////////////////////////////////
};

/**
 * Create a new identity using the provided portable contacts schema.
 */
exports.makeClientForNewIdentity = function(poco) {
  // -- create the keyrings.
  var rootKeyring, longtermKeyring, keyring;

  rootKeyring = $keyring.createNewPersonRootKeyring();
  longtermKeyring = rootKeyring.issueLongtermSigningKeyring();
  keyring = longtermKeyring.makeDelegatedKeyring();

  // -- create the messaging key group
  keyring.incorporateKeyGroup(
    longtermKeyring.issueKeyGroup('messaging', {
        envelope: 'box',
        payload: 'box',
        announce: 'sign',
        tell: 'box',
      }));


  // -- create the server-less self-ident
  var personSelfIdentBlob = $pubident.generatePersonSelfIdent(
                              longtermKeyring, keyring,
                              poco, null);

  var persistedBlob = {
    selfIdent: personSelfIdentBlob,
    keyrings: {
      root: personRootRing.data,
      longterm: personLongtermRing.data,
      general: personKeyring.data,
    },
  };
};

exports.getClientForExistingIdentity = function(persistedBlob) {
};

var LOGFAB = exports.LOGFAB = $log.register($module, {
  rawClient: {
    // we are a client/server client, even if we are smart for one
    type: $log.CONNECTION,
    subtype: $log.CLIENT,
    semanticIdent: {
      userIdent: 'key:root:user',
      _l0: null,
      clientIdent: 'key:client',
      _l1: null,
      serverIdent: 'key:server',
    },
    stateVars: {
      haveConnection: true,
    },
  }
});

}); // end define
