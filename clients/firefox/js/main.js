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

/*jslint indent: 2, strict: false, plusplus: false */
/*global define: false, document: false, setTimeout: false, history: false,
  setInterval: false */

/**
 * Main JS file, bootstraps the logic.
 */

define(function (require) {
  var $ = require('jquery'),
      cards = require('cards'),
      moda = require('moda'),
      friendly = require('friendly'),

      commonNodes = {},
      peeps, update, messageCloneNode, notifyDom, nodelessActions;

  function getChildCloneNode(node) {
    return commonNodes[node.getAttribute('data-childclass')];
  }

  function updateDom(rootDom, model) {
    // Update the data bound nodes.
    rootDom.find('[data-bind]').each(function (i, node) {
      var bindName = node.getAttribute('data-bind'),
          attrName = node.getAttribute('data-attr'),
          value = model[bindName],
          parts;

      // Allow for dot names in the bindName
      if (bindName.indexOf('.') !== -1) {
        parts = bindName.split('.');
        value = model;
        parts.forEach(function (part) {
          value = value[part];
        });
      }

      if (attrName) {
        node.setAttribute(attrName, value);
      } else {
        $(node).text(value);
      }
    });
  }

  function makeMessageBubble(node, message) {
    var nodeDom = $(node),
        metaNode, senderNode, senderDom,
        isMe = moda.me().id === message.from.id;

    // do declarative text replacements.
    updateDom(nodeDom, message);

    // Insert the friendly time in meta, and message text before meta
    metaNode = nodeDom.find('.meta').text(friendly.date(new Date(message.time)).friendly)[0];
    metaNode.setAttribute('data-time', message.time);
    metaNode.parentNode.insertBefore(document.createTextNode(message.text), metaNode);

    // Update the URL to use for the peep
    senderDom = nodeDom.find('.sender');
    senderNode = senderDom[0];
    senderNode.href = senderNode.href + encodeURIComponent(message.from.id);

    // Apply different style if message is from "me"
    nodeDom.addClass(isMe ? 'right' : 'left');

    // If me, then swap the positions of the picture and name.
    if (isMe) {
      senderDom.find('.name').prependTo(senderDom);
    }

    return node;
  }

  function formToObject(formNode) {
    var obj = {}, node, value, i;

    for (i = 0; (node = formNode.elements[i]); i++) {
      value = (node.value || '').trim();
      if (node.name && value) {
        obj[node.name] = value;
      }
    }
    return obj;
  }

  // Set up card update actions.
  update = {
    'start': function (data, dom) {
      // Use user ID as the title
      dom[0].title = moda.me().id;
    },

    'peeps': function (data, dom) {
      // Get the node to use for each peep.
      var clonable = commonNodes[dom.attr('data-childclass')];

      //Hmm, think of a better way to do this: do same action after
      // loading all peeps or when peeps are already available.
      function onPeepsComplete() {
        var frag = document.createDocumentFragment();

        // Put in the Add button.
        frag.appendChild(commonNodes.addPersonLink.cloneNode(true));

        // Generate nodes for each person.
        peeps.items.forEach(function (peep) {
          var node = clonable.cloneNode(true);
          node.href += '?id=' + encodeURIComponent(peep.id);
          node.appendChild(document.createTextNode(peep.name));
          frag.appendChild(node);
        });

        // Update the card.
        dom.append(frag);

        // Refresh card sizes.
        cards.adjustCardSizes();
      }

      if (peeps) {
        onPeepsComplete();
      } else {
        peeps = moda.peeps({}, {
          'peepsComplete': onPeepsComplete
        });
      }
    },

    'listUsersForAddPeep': function (data, dom) {
      // Get the node to use for each peep.
      var clonable = commonNodes[dom.attr('data-childclass')],
          frag = document.createDocumentFragment();

      moda.users({}, {
        'usersComplete': function (users) {
          var me = moda.me(),
              known = {};

          // Filter out already known users.
          known[me.id] = true;
          peeps.items.forEach(function (peep) {
            known[peep.id] = true;
          });

          users = users.filter(function (user) {
            if (!known[user.id]) {
              return true;
            }
            return false;
          });

          users.forEach(function (user) {
            var node = clonable.cloneNode(true);
            node.href += '&id=' + encodeURIComponent(user.id);
            node.appendChild(document.createTextNode(user.name));
            frag.appendChild(node);
          });

          // Update the card.
          dom.append(frag);

          // Refresh card sizes.
          cards.adjustCardSizes();
        }
      });
    },

    'addPeep': function (data) {
      var peepId = data.id;

      peeps.addPeep(peepId, function (peep) {
        // Update the peeps card.
        $('[data-cardid="peeps"]').each(function (i, node) {
          // Replace the old peeps card with a new one.
          var cardNode = cards.templates.peeps.cloneNode(true);
          node.parentNode.replaceChild(cardNode, node);
          update.peeps({}, $(cardNode));
        });

        // Go back one in the navigation.
        setTimeout(function () {
          history.back();
        }, 30);
      });
    },

    'peep': function (data, dom) {
      var peepId = data.id,
          conversationsNode = dom.find('.peepConversations')[0],
          convCloneNode = getChildCloneNode(conversationsNode),
          frag = document.createDocumentFragment(),
          peep = peeps.items.filter(function (peep) {
            if (peep.id === peepId) {
              return peep;
            } else {
              return undefined;
            }
          })[0];

      // Clear out old conversations
      conversationsNode.innerHTML = '';

      updateDom(dom, peep);

      // Add the right peep IDs to the compose form.
      dom
        .attr('data-peepid', peepId)
        .find('[name="to"]')
          .val(peepId)
          .end()
        .find('[name="from"]')
          .val(moda.me().id);

      // Fill in list of conversations.
      peep.getConversations(function (conversations) {
        conversations.forEach(function (conv) {
          var node = convCloneNode.cloneNode(true),
              messages = conv.messages,
              msg, lastMsg, i;

          for (i = messages.length - 1; i > -1 && (msg = messages[i]); i--) {
            if (msg.from.id === peep.id) {
              lastMsg = msg;
              break;
            }
          }
          if (!lastMsg) {
            lastMsg = messages[messages.length - 1];
          }

          $(node).text(lastMsg.text);
          node.href +=  '?id=' + encodeURIComponent(conv.id);

          frag.appendChild(node);

          conversationsNode.appendChild(frag);

          // refresh the card sizes
          cards.adjustCardSizes();
        });
      });
    },
    'conversation': function (data, dom) {
      var convId = data.id,
          messagesNode = dom.find('.conversationMessages')[0],
          frag = document.createDocumentFragment(),
          conversation;

      // Save the message clone node for later if
      // not already set.
      if (!messageCloneNode) {
        messageCloneNode = getChildCloneNode(messagesNode);
      }

      // Get a conversation object.
      conversation = moda.conversation({
        by: 'id',
        filter: convId
      });

      // Wait for messages before showing the messages.
      conversation.withMessages(function (conv) {
        // Clear out old messages
        messagesNode.innerHTML = '';

        conversation.messages.forEach(function (message) {
          frag.appendChild(makeMessageBubble(messageCloneNode.cloneNode(true), message));
        });

        messagesNode.appendChild(frag);

        // Refresh the card sizes
        cards.adjustCardSizes();
      });

      // Set up compose area
      dom
      .attr('data-conversationid', conversation.id)
      .find('[name="convId"]')
        .val(conversation.id)
        .end()
      .find('[name="from"]')
        .val(moda.me().id);
    }
  };

  // Listen to events from moda
  moda.on({
    'message': function (message) {
      var card = cards.currentCard(), node, nodeDom, convNode,
          convNotificationDom, convCloneNode;

      if (card.attr('data-cardid') === 'conversation' &&
        card.attr('data-conversationid') === message.convId) {
        // Update the current conversation.
        card.find('.conversationMessages').append(makeMessageBubble(messageCloneNode.cloneNode(true), message));
        cards.adjustCardSizes();
      } else if (message.from.id === moda.me().id) {
        // If message is from me, it means I wanted to start a new conversation.
        cards.nav('conversation?id=' + message.convId);
      } else {
        convNotificationDom = $('.newConversationNotifications');

        // Add a conversation box to the start card, but only if there is not
        // one already.
        if (convNotificationDom.find('[data-convid="' + message.convId + '"]').length === 0) {
          convNode = convNotificationDom[0];
          convCloneNode = getChildCloneNode(convNode);
          node = convCloneNode.cloneNode(true);
          nodeDom = $(node);
          updateDom(nodeDom, message);

          // Insert friendly date-time
          nodeDom.find('.newConversationTime')
            .text(friendly.date(new Date(message.time)).friendly)
            .attr('data-time', message.time);

          // Update the hyperlink
          node.href = node.href + encodeURIComponent(message.convId);

          // Add the conversation ID to the node
          node.setAttribute('data-convid', message.convId);

          convNode.appendChild(node);
          cards.adjustCardSizes();

          // Activate new notification.
          notifyDom.show();
        }
      }

      // console.log("GOT A MESSAGE: ", message);
    }
  });

  // Wait for DOM ready to do some DOM work.
  $(function () {

    // Hold on to common nodes for use later.
    $('#common').children().each(function (i, node) {
      commonNodes[node.getAttribute('data-classimpl')] = node;
      node.parentNode.removeChild(node);
    });

    // Now insert commonly used nodes in any declarative cases.
    $('[data-class]').each(function (i, origNode) {
      var classImpl = origNode.getAttribute('data-class'),
          node = commonNodes[classImpl].cloneNode(true);

      origNode.parentNode.replaceChild(node, origNode);
    });

    // If user is not logged in, then set the start card to signin.
    if (!moda.me()) {
      cards.startCardId = 'signIn';
    }

    // Initialize the cards
    cards($('#cardContainer'));

    nodelessActions = {
      'back': true,
      'notify': true
    };

    // Listen for nav items.
    cards.onNav = function (templateId, data) {
      var cardNode;
      if (nodelessActions[templateId]) {
        // A "back" action that could modify the data in a previous card.
        if (data.action && update[data.action]) {
          update[data.action](data);
        }
      } else {
        // A new action that will generate a new card.
        cardNode = $(cards.templates[templateId].cloneNode(true));

        if (update[templateId]) {
          update[templateId](data, $(cardNode));
        }

        cards.add(cardNode);

        if (templateId !== 'start' && templateId !== 'signIn') {
          cards.forward();
        }
      }
    };

    cards.onReady = function () {
      // Save a reference to the notify DOM
      notifyDom = $('#notify');
    };

    $('body')
      .delegate('#notify', 'click', function (evt) {
        evt.preventDefault();

        // Clear notification
        notifyDom.hide();

        // Go back the number of steps to the start card.
        var cardsDom = cards.allCards(),
          length = cardsDom.length,
          index, i, card, jumpLength;

        for (i = 0; (card = cardsDom[i]); i++) {
          if (card.getAttribute('data-cardid') === 'start') {
            index = i;
            break;
          }
        }

        jumpLength = -(length - index - 1);
        history.go(jumpLength);
      })

      // Handle sign in form
      .delegate('.signInForm', 'submit', function (evt) {
        evt.preventDefault();

        var formDom = $(evt.target),
            id = formDom.find('[name="id"]').val(),
            name = formDom.find('[name="name"]').val();

        moda.signIn(id, name, function (me) {
          // Remove the sign in card
          $('[data-cardid="signIn"]', '#cardContainer').remove();

          // Show the start card
          cards.onNav('start', {});
        });
      })

      // Handle compose from a peep screen.
      .delegate('[data-cardid="peep"] .compose', 'submit', function (evt) {
        evt.preventDefault();

        moda.startConversation(formToObject(evt.target));

        // Clear out the form for the next use.
        evt.target.text.value = '';
      })

      // Handle compose inside a conversation
      .delegate('[data-cardid="conversation"] .compose', 'submit', function (evt) {
        evt.preventDefault();

        var form = evt.target,
            data = formToObject(form);

        // Reset the form
        form.text.value = '';
        form.text.focus();

        // Send the message
        moda.conversation({
          by: 'id',
          filter: data.convId
        }).sendMessage(data);

      })

      // Handle clicks on new conversation links
      .delegate('a.newConversation', 'click', function (evt) {
        var node = evt.currentTarget;

        // Remove the box from the DOM, but do it on a delay,
        // after transition has happened.
        setTimeout(function () {
          node.parentNode.removeChild(node);
          cards.adjustCardSizes();
        }, 1000);

      })

      // Handle submitting the text in the text field on enter key
      .delegate('form.compose textarea', 'keypress', function (evt) {
        if (evt.keyCode === 13) {
          $(evt.target).parent('form').trigger('submit');
        }
      });

    // Periodically update the timestamps shown in the page, every minute.
    setInterval(function () {
      $('[data-time]').each(function (i, node) {
        var dom = $(node),
            value = parseInt(dom.attr('data-time'), 10),
            text = friendly.date(new Date(value)).friendly;

        dom.text(text);
      });
    }, 60000);
  });
});
