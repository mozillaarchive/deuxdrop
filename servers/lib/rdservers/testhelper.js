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
 *
 **/

define(
  [
    'rdcommon/identities/privident',
    'rdcommon/rawclient/api',
    'rdcommon/transport/authconn',
    'rdcommon/crypto/keyops',
    'exports'
  ],
  function(
    $privident,
    $rawclient_api,
    $authconn,
    $keyops,
    exports
  ) {

var ClientTestActorMixins = {
  /**
   * Automatically create an identity; a client is not much use without one.
   *  (In the future we may look at the argument bundle provided to the actor
   *  instantiation in order to use an existing one too.)
   */
  __constructor: function(self) {
    self.T.convenienceSetup([self, 'creates identity'], function() {
      // -- create our identity
      // - create our root key
      // - create our long term key
      // - create our self-attestation (this is where our name comes into it)
      self._identity = $privident.generateHumanFullIdent({
        name: self.__name,
        suggestedNick: self.__name,
      });
    });
  },

  signupWith: function(server) {
    this._usingServer = server;
  },

  setup_useServer: function setup_useServer(server) {
    this.T.convenienceSetup([this, 'creates account with', server], function() {
      this.signupWith(server);
    });
  },

  /**
   * Create mutual friendship relationships between 'this' client and the
   *  provided clients.
   */
  setup_superFriends: function(friends) {
    var tofriend = friends.concat([this]);
    this.T.convenienceSetup(
      ['setup mutual friend relationships among:'].concat(tofriend),
    function() {
      // (the destructive mutation is fine)
      while (tofriend.length >= 2) {
        var focal = tofriend.pop();
        for (var i = 0; i < tofriend.length; i++) {
          var other = tofriend[i];
          focal.addContact(other);
          focal._usingServer.expect_XXX();
          other.addContact(focal);
        }
      }
    });
  },

  writeMessage: function(conv, outMsgThing, recipients) {
  },

  replyToMessageWith: function(msgReplyingTo, outMsgThing) {
  },

  expect_receiveMessages: function() {
  },

  inviteToConv: function(recipient, outConvThing) {
    throw new Error("XXX NOT IMPLEMENTED");
  },
};

var MailstoreActorMixins = {
  __constructor: function(self) {
    self.T.convenienceSetup([self, 'creates self to get port'], function() {
      self.expect_listening();

      self._server = new $authconn.AuthorizingServer();
      self._server.listen();
    });
    self.T.convenienceSetup(
      [self, 'creates its identity and registers implementations'], function() {
      // -- create our identity
      // - create our root key
      var rootKeypair = $keyops.generateRootSigningKeypair();
      // - create our long term key
      var now = Date.now();
      var longtermBoxBundle = $keyops.generateAndAuthorizeLongtermKeypair(
                                rootKeypair, 'box',
                                now, now + $keyops.MAX_AUTH_TIMESPAN);
      // - create our self-attestation (this is where our name comes into it)
      var selfIdent = $privident.generateServerSelfIdent(
        rootKeypair,
        longtermBundle,
        {
          tag: "server:mailstore",
          host: '127.0.0.1',
          port: self._server.address.port,
        });

      // -- bind the server definitions
    });
  },
};

var ComboTestActorMixins = {
};

var MessageThingMixins = {
  expect_receivedBy: function() {
  },
};

exports.TESTHELPER = {
  actorMixins: {
    client: ClientTestActorMixins,
    combo: ComboTestActorMixins,
  },

  thingMixins: {
    message: MessageThingMixins,
  },
};

}); // end define
