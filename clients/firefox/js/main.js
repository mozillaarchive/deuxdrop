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
/*global define: false, document: false, setTimeout: false, history: false */

/**
 * Main JS file, bootstraps the logic.
 */

define(function (require) {
  var $ = require('jquery'),
      cards = require('cards'),
      moda = require('moda'),

      commonNodes = {},
      peeps,
      update;

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

  // Set up card update actions.
  update = {
    'start': function (data, dom) {
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
          var me = moda.me();
          // Filter out me from users.
          users = users.filter(function (user) {
            if (user.id !== me.id) {
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
          messageCloneNode = getChildCloneNode(messagesNode),
          frag = document.createDocumentFragment(),
          conversation;

      // TODO: this should be an async setup.
      conversation = moda.conversation({
        by: 'id',
        filter: convId
      });

      // Clear out old messages
      messagesNode.innerHTML = '';

      conversation.messages.forEach(function (message) {
        var node = messageCloneNode.cloneNode(true);
        updateDom($(node), message);
        frag.appendChild(node);
      });

      messagesNode.appendChild(frag);

      // Refresh the card sizes
      cards.adjustCardSizes();
    }
  };

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

    // Listen for nav items.
    cards.onNav = function (templateId, data) {
      var cardNode;
      if (templateId === 'back') {
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

    $('body')
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
      });
  });
});
