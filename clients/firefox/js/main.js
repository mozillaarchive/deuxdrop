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
/*global define: false, document: false */

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

  /**
   * Sets up a new card's data and moves the cards.
   */
  function changeCard(refNode, id) {
    if (update[id]) {
      update[id](refNode, id, $('#' + id));
    }
    return cards.moveTo(id);
  }

  function getChildCloneNode(node) {
    return commonNodes[node.getAttribute('data-childclass')];
  }

  function updateDom(rootDom, model) {
    // update the data bound nodes.
    rootDom.find('[data-bind]').each(function (i, node) {
      var bindName = node.getAttribute('data-bind'),
          attrName = node.getAttribute('data-attr'),
          value = model[bindName],
          parts;

      // allow for dot names in the bindName
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

  // set up card update actions.
  update = {
    'peeps': function (refNode, id, dom) {
      var clonable;

      // do not bother if it is already updated.
      if (dom[0].hasAttribute("updated")) {
        return;
      }
      dom.attr('updated', 'updated');

      // get the node to use for each peep.
      clonable = commonNodes[dom.attr('data-childclass')];

      peeps = moda.peeps({}, {
        'peepsComplete': function (peeps) {
          var frag = document.createDocumentFragment();

          // generate nodes for each person.
          peeps.forEach(function (peep) {
            var node = clonable.cloneNode(true);
            node.setAttribute('data-id', peep.id);
            node.appendChild(document.createTextNode(peep.name));
            frag.appendChild(node);
          });

          // update the card.
          dom.append(frag);

          // refresh card sizes.
          cards.adjustCardSizes();
        }
      });
    },

    'peep': function (refNode, id, dom) {
      // update the peep's ID from the refNode
      var peepId = refNode.getAttribute('data-id'),
          conversationsNode = document.getElementById('peepConversations'),
          convCloneNode = getChildCloneNode(conversationsNode),
          frag = document.createDocumentFragment(),
          peep = peeps.items.filter(function (peep) {
            if (peep.id === peepId) {
              return peep;
            } else {
              return undefined;
            }
          })[0];

      // clear out old conversations
      conversationsNode.innerHTML = '';

      updateDom(dom, peep);

      // fill in list of conversations.
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
          node.setAttribute('data-id', conv.id);

          frag.appendChild(node);

          conversationsNode.appendChild(frag);

          // refresh the card sizes
          cards.adjustCardSizes();
        });
      });
    },
    'conversation': function (refNode, id, dom) {
      var convId = refNode.getAttribute('data-id'),
          messagesNode = document.getElementById('conversationMessages'),
          messageCloneNode = getChildCloneNode(messagesNode),
          frag = document.createDocumentFragment(),
          conversation;

      // TODO: this should be an async setup.
      conversation = moda.conversation({
        by: 'id',
        filter: convId
      });

      // clear out old messages
      messagesNode.innerHTML = '';

      conversation.messages.forEach(function (message) {
        var node = messageCloneNode.cloneNode(true);
        updateDom($(node), message);
        frag.appendChild(node);
      });

      messagesNode.appendChild(frag);

      // refresh the card sizes
      cards.adjustCardSizes();
    }
  };

  // wait for DOM ready to do some DOM work.
  $(function () {

    // hold on to common nodes for use later.
    $('#common').children().each(function (i, node) {
      commonNodes[node.getAttribute('data-classimpl')] = node;
      node.parentNode.removeChild(node);
    });

    // now insert commonly used nodes in any declarative cases.
    $('[data-class]').each(function (i, origNode) {
      var classImpl = origNode.getAttribute('data-class'),
          node = commonNodes[classImpl].cloneNode(true);

      origNode.parentNode.replaceChild(node, origNode);
    });

    $('body')
      .delegate('a', 'click', function (evt) {
        var a = evt.target,
            cardId;

        if (a.href && a.href.indexOf('#') !== -1) {
          cardId = a.href.split('#')[1];
          changeCard(a, cardId);
          evt.preventDefault();
        }
      });

    // initialize the cards
    cards($('#cardContainer'));

  });
});