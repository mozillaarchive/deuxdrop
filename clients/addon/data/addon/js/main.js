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
      moda = require('modality'),
      friendly = require('friendly'),
      browserId = require('browserId'),
      IScroll = require('iscroll'),

      commonNodes = {},
      states = {},
      servers,
      peeps, update, notifyDom, nodelessActions,
      newMessageIScroll, newConversationNodeWidth, init, me;

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
        isMe = me.id === message.from.id;

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

  function onPeepsComplete(dom) {
    // Get the node to use for each peep.
    var clonable = getChildCloneNode(dom[0]),
        frag = document.createDocumentFragment();

    // Put in the Add button.
    frag.appendChild(commonNodes.addPersonLink.cloneNode(true));

    // Generate nodes for each person.
    peeps.items.forEach(function (peep) {
      var node = clonable.cloneNode(true),
          poco = peep.ourPoco;

      updateDom($(node), poco);

      node.href += '?id=' + encodeURIComponent(peep.id);

      frag.appendChild(node);
    });

    // Update the card.
    dom.find('.scroller').append(frag);

    // Refresh card sizes.
    cards.adjustCardSizes();
  }

  // Set up card update actions.
  update = {
    'signIn': function (data, dom) {

      function handleSubmit(evt) {
        evt.preventDefault();
        evt.stopPropagation();

        var nameDom = dom.find('[name="name"]'),
            name = nameDom.val().trim();

        // Reset error style in case this is a second try.
        nameDom.removeClass('error');

        if (name) {
          browserId.getVerifiedEmail(function (assertion) {
            if (assertion) {
              // Provide our poco
              me.updatePersonalInfo({
                displayName: name
              });
              me.provideProofOfIdentity('email', 'browserid', assertion);
              cards.onNav('pickServer', {});
            } else {
              // Do not do anything. User stays on sign in screen.
            }
          });
        } else {
          // Inform user that the form needs to be filled in.
          nameDom.addClass('error');
        }
      }

      // Create an explicit click handler to help some iphone devices,
      // event bubbling does not allow the window to open.
      dom
        .find('.signUpForm')
          .submit(handleSubmit)
          .end()
        .find('.browserSignIn')
          .click(handleSubmit);
    },

    'needServer': function (data, dom) {
      cards.adjustCardSizes();
    },

    'pickServer': function (data, dom) {

      var clonable = getChildCloneNode(dom[0]),
          frag = document.createDocumentFragment();

      // Generate nodes for each person.

      // Now show list of servers.
      moda.queryServers({
        'onCompleted': function (liveOrderedSet) {
          servers = liveOrderedSet;

          Object.keys(servers.items).forEach(function (key) {
            var node = clonable.cloneNode(true),
                server = servers.items[key];

            updateDom($(node), server);

            node.href += encodeURIComponent(key);

            frag.appendChild(node);
          });

          // Put in the Add button.
          frag.appendChild(commonNodes.addServerLink.cloneNode(true));

          // Update the card.
          dom.find('.scroller').append(frag);

          // Refresh card sizes.
          cards.adjustCardSizes();
        }
      });
    },

    'connectToServer': function (data) {
      var serverInfo = data.id ? servers.items[data.id] : {
        url: data.url
      };

      //TODO: this call does not return anything/no callbacks?
      me.signupWithServer(serverInfo);

      //For now, assume it works?

      // Remove the sign in/server setup cards
      $('[data-cardid="signIn"], [data-cardid="pickServer"], ' +
        '[data-cardid="enterServer"], [data-cardid="needServer"]',
        '#cardContainer').remove();

      // Show the start card
      cards.onNav('start', {});

      // Go back one to see the start card.
      history.back();
    },

    'peeps': function (data, dom) {
      if (peeps) {
        onPeepsComplete(dom);
      } else {
        // QUESTION: can pass a "data" argument as third arg to queryPeeps,
        // set as a property on liveOrderedSet, but not touched by anything,
        // just context data for listener callbacks?
        moda.queryPeeps({by: 'alphabet'}, {
          onSplice: function (index, howMany, addedItems, liveOrderedSet) {
            // Ignore for now, only regenerate UI if user goes to
            // that card? Well, could update it if it is in one of the
            // history cards, but need to be careful about moving the
            // user's view on that card with update in a way that messes up
            // their mental model of where they are on that card.
          },

          onCompleted: function (liveOrderedSet) {
            //Peeps are assumed to be in an array at liveOrderedSet.items;
            peeps = liveOrderedSet;
            onPeepsComplete(dom);
          }
        });
      }
    }
  };

  // Find out the user.
  moda.whoAmI({
    'onCompleted': function (unknown)  {
      me = unknown;
      init('userDetermined');
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

    init('domReady');

  });

  init = function (state) {
    states[state] = true;

    if (!states.domReady || !states.userDetermined) {
      return;
    }

    if (!me || !me.havePersonalInfo) {
      cards.startCardId = 'signIn';
    } else if (me && !me.haveServerAccount) {
      cards.startCardId = 'needServer';
    }

    nodelessActions = {
      'addPeep': true,
      'notify': true,
      'browserIdSignIn': true,
      'connectToServer': true,
      'signOut': true
    };

    var startCardIds = {
      'start': true,
      'signIn': true,
      'needServer': true
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

        if (!startCardIds[templateId]) {
          cards.forward();
        }
      }
    };

    cards.onReady = function () {
      // Save a reference to the notify DOM
      notifyDom = $('#notify');
    };

    $('body')
      // Form submissions for entering a server.
      .delegate('[data-cardid="enterServer"] .enterServerForm', 'submit',
        function (evt) {
          evt.preventDefault();
          evt.stopPropagation();

          var url = $(evt.target).find('[name="server"]').val().trim().toLowerCase();
          if (url) {
            update.connectToServer({
              url: url
            });
          }
        }
      )

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

    // Set init to null, to indicate init work has already been done.
    init = null;
  };
});
