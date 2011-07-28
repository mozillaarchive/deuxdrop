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
  setInterval: false, location: true, window: true, navigator: false,
  alert: false */

/**
 * Main JS file, bootstraps the logic.
 */

// If not on the start of the UI, redirect to top of the UI,
// since the UI cannot build up the correct state for possible substates yet.
if (location.href.split('#')[1]) {
  location.replace(location.pathname);
}

define(function (require) {
  var $ = require('jquery'),
      cards = require('cards'),
      moda = require('moda'),
      friendly = require('friendly'),
      browserId = require('browserId'),
      IScroll = require('iscroll'),

      commonNodes = {},
      states = {},
      users = {},
      notifications = [],
      peeps, update, messageCloneNode, notifyDom, nodelessActions,
      newMessageIScroll, newConversationNodeWidth, init;

  //iScroll just defines a global, bind to it here
  IScroll = window.iScroll;

  // Browser ID is not actually a module, get a handle on it now.
  browserId = navigator.id;

  function getChildCloneNode(node) {
    // Try on the actual node, and if not there, check the scroller node
    var attr = node.getAttribute('data-childclass');
    if (!attr) {
      attr = $('.scroller', node).attr('data-childclass');
    }
    return commonNodes[attr];
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

  function insertTextAndMeta(nodeDom, message) {
    // Insert the friendly time in meta, and message text before meta
    var metaNode = nodeDom.find('.meta').text(friendly.date(new Date(message.time)).friendly)[0];
    metaNode.setAttribute('data-time', message.time);
    metaNode.parentNode.insertBefore(document.createTextNode(message.text), metaNode);
  }

  function adjustNewScrollerWidth(convScrollerDom) {
    convScrollerDom = convScrollerDom || $('.newConversationScroller');
    convScrollerDom.css('width', (convScrollerDom.children().length * newConversationNodeWidth) + 'px');
  }

  function makeMessageBubble(node, message) {
    var nodeDom = $(node),
        senderNode, senderDom,
        isMe = moda.me().id === message.from.id;

    // do declarative text replacements.
    updateDom(nodeDom, message);

    // Insert the friendly time in meta, and message text before meta
    insertTextAndMeta(nodeDom, message);

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

  function insertUnseenMessage(message) {
    var convNotificationDom = $('.newConversationNotifications'),
        convScrollerDom = convNotificationDom.find('.newConversationScroller'),
        convNode, convCloneNode, node, nodeDom;

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

      convScrollerDom.prepend(node);

      if (!newConversationNodeWidth) {
        // Lame. adding extra 20px. TODO fix this.
        newConversationNodeWidth = $(node).outerWidth() + 20;
      }

      // Figure out how big to make the horizontal scrolling area.
      adjustNewScrollerWidth(convScrollerDom);

      cards.adjustCardSizes();

      if (newMessageIScroll) {
        newMessageIScroll.refresh();
      }

      // Activate new notification, but only if not already on start page.
      if (cards.currentCard().attr('data-cardid') !== 'start') {
        notifyDom.show();
      }
    }
  }

  function adjustCardScroll(card) {
    // Scroll to the bottom of the conversation
    setTimeout(function () {
      // If the message contents are longer than the containing element,
      // scroll down.
      if (card.innerHeight() < card.find('.scroller').innerHeight()) {
        var scroller = cards.getIScroller(card);
        if (scroller) {
          scroller.scrollToElement(card.find('.compose')[0], 200);
        } else {
          card[0].scrollTop = card[0].scrollHeight;
        }
      }
    }, 300);
  }

  // Set up card update actions.
  update = {
    'signIn': function (data, dom) {

      // Create an explicit click handler to help some iphone devices,
      // event bubbling does not allow the window to open.
      dom.find('.browserSignIn')
        .click(function (evt) {
          browserId.getVerifiedEmail(function (assertion) {
            if (assertion) {
              moda.signIn(assertion, function (me) {
                // Remove the sign in card
                $('[data-cardid="signIn"]', '#cardContainer').remove();

                // Show the start card
                cards.onNav('start', {});
              });
            } else {
              // Do not do anything. User stays on sign in screen.
            }
          });
          evt.preventDefault();
          evt.stopPropagation();
        });
    },

    'start': function (data, dom) {
      // Use user ID as the title
      dom[0].title = moda.me().id;

      // Bind the iscroll to allow horizontal scrolling of new messages.
      newMessageIScroll = new IScroll(dom.find('.newConversationNotifications')[0], {
        hScrollbar: true,
        vScrollbar: false
      });
    },

    'notify': function (data, dom) {
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
    },

    'signOut': function () {
      moda.signOut(function () {
        location.reload();
      });
    },

    'notifications': function (data, dom) {
      var dataChildNode = dom.find('.scroller')[0],
          dataChildren = {},
          serverIds = [],
          frag = document.createDocumentFragment();

      // Cycle through the notifications and show them.
      notifications.forEach(function (notification) {
        var type = notification.type,
            data = notification.data,
            nodeClassName = dataChildren[type] ||
                  (dataChildren[type] = dataChildNode.getAttribute('data-child' +
                                                                   type.toLowerCase())),
            node = commonNodes[nodeClassName].cloneNode(true);

        if (type === 'addedYou') {
          updateDom($(node), data.user);
          node.href += '?id=' + encodeURIComponent(data.user.id);
          node.appendChild(document.createTextNode(' added you'));
        }

        frag.appendChild(node);

        //
        // Hold on to the IDs to give to the server to mark them seen.
        serverIds.push(data.unseenId);
      });

      // Show all the notifications.
      dataChildNode.appendChild(frag);

      // Let the server know these notifications have been seen.
      moda.markBulkSeen(serverIds);

      // Clear the notification UI
      notifyDom.hide();
      $('.notificationCount').addClass('hidden').text('');
    },

    'peeps': function (data, dom) {
      // Get the node to use for each peep.
      var clonable = getChildCloneNode(dom[0]);

      //Hmm, think of a better way to do this: do same action after
      // loading all peeps or when peeps are already available.
      function onPeepsComplete() {
        var frag = document.createDocumentFragment();

        // Put in the Add button.
        frag.appendChild(commonNodes.addPersonLink.cloneNode(true));

        // Generate nodes for each person.
        peeps.items.forEach(function (peep) {
          var node = clonable.cloneNode(true);

          updateDom($(node), peep);

          node.href += '?id=' + encodeURIComponent(peep.id);

          frag.appendChild(node);
        });

        // Update the card.
        dom.find('.scroller').append(frag);

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
      var clonable = getChildCloneNode(dom[0]),
          frag = document.createDocumentFragment();

      moda.users({}, {
        'usersComplete': function (allUsers) {
          var me = moda.me(),
              known = {};

          // Filter out already known users.
          known[me.id] = true;
          peeps.items.forEach(function (peep) {
            known[peep.id] = true;
          });

          allUsers = allUsers.filter(function (user) {
            // First, add the user to global list of users.
            // Doing the work here to piggyback on the iteration.
            if (!users[user.id]) {
              users[user.id] = user;
            }

            // Now do the filtering.
            if (!known[user.id]) {
              return true;
            }
            return false;
          });

          allUsers.forEach(function (user) {
            var node = clonable.cloneNode(true);
            node.href += encodeURIComponent(user.id);
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

      function onPeepsComplete() {
        peeps.addPeep(peepId, function (peep) {
          // Update the peeps card.
          $('[data-cardid="peeps"]').each(function (i, node) {
            // Replace the old peeps card with a new one.
            var cardNode = cards.templates.peeps.cloneNode(true);
            node.parentNode.replaceChild(cardNode, node);
            update.peeps({}, $(cardNode));
          });

          // Go back one in the navigation.
          history.back();
        });
      }

      if (peeps) {
        onPeepsComplete();
      } else {
        peeps = moda.peeps({}, {
          'peepsComplete': onPeepsComplete
        });
      }
    },

    'user': function (data, dom) {
      var userId = data.id,
          conversationsNode = dom.find('.peepConversations')[0],
          convCloneNode = getChildCloneNode(conversationsNode);

      moda.user(userId, function (user) {

        // Clear out old conversations
        conversationsNode.innerHTML = '';

        updateDom(dom, user);

        // Add the right peep IDs to the compose form.
        dom
          .attr('data-peepid', userId)
          .find('[name="to"]')
            .val(userId)
            .end()
          .find('[name="from"]')
            .val(moda.me().id);

        // If the user is not in the chat permission list, do not show
        // the compose form.
        if (!user.perms.peep) {
          dom
            .find('.compose')
              .addClass('hidden')
              .end()
            .find('.addPeepButtonForm')
              .removeClass('hidden');
        } else if (!user.perms.chat) {
          dom
            .find('.compose')
              .addClass('hidden')
              .end()
            .find('.addToChatMessage')
              .removeClass('hidden');
        }

        // Fill in list of conversations.
        user.getConversations(function (conversations) {

          var frag = document.createDocumentFragment();

          conversations.forEach(function (conv) {
            var node = convCloneNode.cloneNode(true),
                nodeDom = $(node),
                message = conv.message;

            //Insert the message text and time.
            insertTextAndMeta(nodeDom, message);

            // Update the link to have the conversation ID.
            node.href += encodeURIComponent(message.convId);

            frag.appendChild(node);

            // refresh the card sizes
            cards.adjustCardSizes();
          });

          conversationsNode.appendChild(frag);
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

        // Let the server know the messages have been seen
        conversation.setSeen();

        adjustCardScroll(dom);
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
    'unknownUser': function () {
      init('userDetermined');
    },
    'signedIn': function () {
      init('userDetermined');
    },
    'signedOut': function () {
      // User signed out/no longer valid.
      // Clear out all the cards and go back to start
      location.reload();
    },

    'addedYou': function (data) {
      // New notifications go first.
      notifications.unshift({
        type: 'addedYou',
        data: data
      });

      // Update display of notifications.
      $('.notificationCount').removeClass('hidden').text(notifications.length);

      // Activate new notification, but only if not already on start page.
      if (cards.currentCard().attr('data-cardid') !== 'start') {
        notifyDom.show();
      }
    },

    'message': function (message) {
      var card = cards.currentCard();

      if (card.attr('data-cardid') === 'conversation' &&
        card.attr('data-conversationid') === message.convId) {
        // Update the current conversation.
        card.find('.conversationMessages').append(makeMessageBubble(messageCloneNode.cloneNode(true), message));
        cards.adjustCardSizes();

        adjustCardScroll(card);

        // Let the server know the messages have been seen
        moda.conversation({
          by: 'id',
          filter: message.convId
        }).withMessages(function (conv) {
          conv.setSeen();
        });
      } else if (message.from.id === moda.me().id) {
        // If message is from me, it means I wanted to start a new conversation.
        cards.nav('conversation?id=' + message.convId);
      } else {
        insertUnseenMessage(message);
      }
      // console.log("GOT A MESSAGE: ", message);
    }
  });

  moda.init();

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

    init('domReady');

  });

  init = function (state) {
    states[state] = true;

console.log('index.html/main.js called init: ' + state);
    if (!states.domReady || !states.userDetermined) {
      return;
    }

    // If user is not logged in, then set the start card to signin.
    if (!moda.me()) {
      cards.startCardId = 'signIn';
    }

    nodelessActions = {
      'addPeep': true,
      'notify': true,
      'browserIdSignIn': true,
      'signOut': true
    };

    // Listen for nav items.
    cards.onNav = function (templateId, data) {
      var cardDom;

      if (nodelessActions[templateId]) {
        // A "back" action that could modify the data in a previous card.
        if (update[templateId]) {
          update[templateId](data);
        }
      } else {
        // A new action that will generate a new card.
        cardDom = $(cards.templates[templateId].cloneNode(true));

        if (update[templateId]) {
          update[templateId](data, cardDom);
        }

        cards.add(cardDom);

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
      // Handle compose from a peep screen.
      .delegate('[data-cardid="user"] .compose', 'submit', function (evt) {
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

          adjustNewScrollerWidth();

          // Adjust the new conversation list scroll to be back at zero,
          // otherwise it can look weird when going "back" to the start card.
          if (newMessageIScroll) {
            newMessageIScroll.scrollTo(0, 0);
          }
        }, 1000);

      })

      // Handle "add peep" button form clicks.
      .delegate('.addPeepButtonForm', 'submit', function (evt) {
        evt.stopPropagation();
        evt.preventDefault();

        var id = evt.target.peepId.value;

        update.addPeep({
          id: id
        });
      });

    // Initialize the cards
    cards($('#cardContainer'));

    // Periodically update the timestamps shown in the page, every minute.
    setInterval(function () {
      $('[data-time]').each(function (i, node) {
        var dom = $(node),
            value = parseInt(dom.attr('data-time'), 10),
            text = friendly.date(new Date(value)).friendly;

        dom.text(text);
      });
    }, 60000);
  };
});
