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
 * Loopback testing of the group messaging scenario using three clients.
 *
 * Hypothetical how-it-works bits for the group conversation stuff (to be
 *  firmed up and relocated) based on conversation with davida.
 *
 * - Conversation creation.  The sender of the first message creates a new
 *    signing keypair whose public key serves as the identifier for the
 *    conversation.  A self-attestation is generated that specifies the
 *    following and is sent to the fanout server who will re-transmit it to
 *    all invitees:
 *   - The maildrop/mailsender information to use to contact the fanout node
 *      (much like for contacting a person).
 *   - The criteria used to define eligible membership in the group.  This would
 *      usually be an attestation that all of the initial participants are
 *      authorized and have delegation rights.
 *
 * - Conversation inviting.
 *   - The person inviting someone (if authorized) writes an attestation that
 *      they are inviting some identity (per public key) and clarified by that
 *      user's most recent self-attestation (providing contact endpoints) to the
 *      explicitly named conversation (per public key).  They include the
 *      attestation chain that authorized them to join the conversation and sign
 *      the whole thing as a block.  They then verify their own attestation to
 *      verify they truly are authorized.
 *   - Tentatively, no content message (ex: "hey Jon, thought I'd add you") is
 *      associated with the invitation; instead the user is expected to just
 *      send a message to the list that the user will (eventually) see so that
 *      everyone can know why the user is being added.  I have no UX sign-off
 *      on this though, so no assumptions.
 *   - The inviter formulates a message with two or more notable parts and sends
 *      it to the fanout server to re-transmit once it has authorized the user
 *      to participate in the conversation.
 *     - The secret key for the conversation, encrypted with message body-level
 *        encryption so that the recipient and only the recipient can decrypt
 *        the messages.
 *     - The signed attestation chain, encrypted with envelope-level encryption
 *        so that the user's mailstore can automatically subscribe to the
 *        conversation on their behalf.
 *
 * - Fanout server invite request servicing.
 *   -
 *
 * - Invitation receipt / joining (assuming immediate mailstore action).
 *   - The invited person's mailstore receives the invitation message.  A
 *      request is automatically generated to the fanout server for the user
 *      to join.  The request will include the current self-attestation.
 *   - The invitation is filed with the conversation so that a body-reading
 *      device is able to get at the secret-key to get at the contents.
 *      Note that every conversation datastore is going to include one of
 *      these suckers anyways.
 *
 * - Fanout server join request servicing.
 *   - The server receives the request and verifies the attestation chain
 *      given the attestation chain and the public key and nothing else.  In
 *      the future some kind of revocation/turnover BS would obviously be
 *      appropriate.  The main goal is that the server does not have to go
 *      looking for information.
 *   - If the verification passes: the user is added to the list of participants
 *      in the conversation, the backlog of messages is resent to the joiner,
 *      and the fanout server automatically generates a join notification
 *      which is sent to all participants.
 *
 *
 * REQUIREMENTS:
 * - Timely group communication should be possible even in the disconnected
 *    mailstore use-case.
 * - The fanout server should not be able to read the content of messages or
 *    forge messages to the group.
 *
 * TO CONSIDER:
 * - Include some automated time-horizon on conversations?  Not only for
 *    conversation cleanliness, but general algorithmic happiness and disk
 *    space usage happiness (and legal message retention policies.)
 * - Ability to leave a conversation?  (Current option is local nuking.)
 *
 * KEY POINTS:
 * - Messages are encrypted using a shared secret (that is encrypted using
 *    public key crypto when being given to people).
 * - The fanout server does not have to be fully trusted because it never has a
 *    (usable) copy of the symmetric encryption key.
 * - Conversation joiners must explicitly ask the server for a subscription
 *    with a signed blob.  This avoids race conditions about the joiner having
 *    authorized their maildrop to receive mails.
 * - Conversation backfill occurs on joining via standard delivery mechanisms.
 *    This is primarily done for consistency/simplicity.
 * - Everyone is automatically notified of new joins by the fanout server.
 * - Nonces serve as message-id's because we really don't want them reused.
 *    (The assumption is our crypto-primitives are not vulnerable to known
 *    plaintext attacks, especially ones that are highly random and thus
 *    unlikely to compress well.)
 *
 **/

define(
  [
    'rdcommon/testcontext',
    'rdservers/testhelper',
    'module',
    'exports'
  ],
  function(
    $tc,
    $th_rdservers,
    $module,
    exports
  ) {

var TD = exports.TD = $tc.defineTestsFor($module, null,
  [$th_rdservers.TESTHELPER], ['app']);

TD.DISABLED_commonCase('group messaging upgrade from one-on-one', function(T) {
  // clients are test helper entities that have convenience functions.
  var client_a = T.actor('client', 'A'),
      client_b = T.actor('client', 'B'),
      client_c = T.actor('client', 'C');
  // servers have no helpers because they never originate actions.
  var server_x = T.actor('combo', 'X'),
      server_y = T.actor('combo', 'Y'),
      server_z = T.actor('combo', 'Z');
  // (all of the above entities have their own initialization steps)
  // the messages in play...
  var conv = T.thing('conversation', 'conv'),
      msg_a1 = T.thing('message', 'a1'),
      msg_b1 = T.thing('message', 'b1'),
      msg_b2 = T.thing('message', 'b2'),
      join_msg = T.thing('message', 'join'),
      msg_c1 = T.thing('message', 'c1');

  client_a.setup_useServer(server_x);
  client_b.setup_useServer(server_y);
  client_c.setup_useServer(server_z);

  // make everybody already be friends with everybody else
  // XXX this would ideally be one of our permutations or just an additional
  //  explicit step (to invite someone who is not a friend of everyone else)
  client_a.setup_superFriends([client_b, client_c]);

  // -- actual testing stuff
  T.action(client_a, 'initiates one-on-one conversation with', client_b,
           'by sending message', msg_a1, function() {
    client_a.writeMessage(conv, msg_a1, [client_b]);
    msg_a1.expect_receivedBy([client_b]);
  });

  T.action(client_b, 'responds to the messsage', msg_a1, 'of', client_a, 'with',
           msg_b1, function() {
    client_b.replyToMessageWith(msg_a1, msg_b1);
    msg_b1.expect_receivedBy([client_a]);
  });

  T.permutation([
    T.action('The conversation hoster,', client_a, 'invites superfriend',
             client_c, 'to the conversation', function() {
      client_a.inviteToConv([client_c], conv);
    }),
    T.action('A participant in the coversation,', client_b,
             'invites superfriend', client_c, 'to the conversation',
             function() {
      client_b.inviteToConv([client_c], conv);
    }),
  ]);

  T.action(client_c, 'joins', conv, 'and receives the earlier messages:',
           msg_a1, msg_b1, function() {
    client_c.joinConv(join_msg, conv);
    client_c.expect_receiveMessages([msg_a1, msg_b1]);
  });

  T.action(client_a, client_b, 'hear about the joining', function() {
    join_msg.expect_receivedBy([client_a, client_b]);
  });

  T.action(client_b, 'sends message', msg_b2, 'as part of', conv,
           'and it is received by', client_a, client_c, function() {
    client_b.replyToMessageWith(msg_b1, msg_b2);
    msg_b2.expect_receivedBy([client_a, client_c]);
  });
  T.action(client_c, 'sends message', msg_c1, 'as part of', conv,
           'and it is received by', client_a, client_b, function() {
    client_c.replyToMessageWith(msg_b2, msg_c1);
    msg_c1.expect_receivedBy([client_a, client_b]);
  });
});

}); // end define
