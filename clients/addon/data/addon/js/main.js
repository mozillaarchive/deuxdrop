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
      update = {}, remove = {}, notifyDom, nodelessActions,
      newMessageIScroll, newConversationNodeWidth, init, me,

      jqBody = $('body');

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
          if (value != null)
            value = value[part];
        });
        if (value == null)
          value = '';
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
    var metaNode = nodeDom.find('.meta').text(
                     friendly.date(new Date(message.receivedAt)).friendly)[0];
    metaNode.setAttribute('data-time', message.receivedAt);
    metaNode.parentNode.insertBefore(document.createTextNode(message.text),
                                     metaNode);
  }

  function adjustNewScrollerWidth(convScrollerDom) {
    convScrollerDom = convScrollerDom || $('.newConversationScroller');
    convScrollerDom.css('width', (convScrollerDom.children().length * newConversationNodeWidth) + 'px');
  }

  function makeMessageBubble(node, message) {
    var nodeDom = $(node),
        senderNode, senderDom;

    // do declarative text replacements.
    updateDom(nodeDom, message);

    // Insert the friendly time in meta, and message text before meta
    insertTextAndMeta(nodeDom, message);

    // Update the URL to use for the peep
    senderDom = nodeDom.find('.sender');
    senderNode = senderDom[0];
    senderNode.href = senderNode.href + encodeURIComponent(message.author.id);

    // Apply different style if message is from "me"
    nodeDom.addClass(message.author.isMe ? 'right' : 'left');

    // If me, then swap the positions of the picture and name.
    if (message.author.isMe) {
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

  var _nextUniqueId = 0;
  function genUniqueId() {
    return 'eweniq' + _nextUniqueId++;
  }

  /**
   * Map entries in the poco to labeled things.
   */
  var POCO_PUBLISH_AND_LABEL_MAP = {
    emails: 'email',
  };
  /**
   * Generate a DOM node to display the contents of a poco dictionary we care
   *  about.
   */
  function generatePocoListNode(poco) {
    var root = commonNodes['menuRoot'].cloneNode(true),
        itemTemplate = commonNodes['menuItem'];

    for (var key in POCO_PUBLISH_AND_LABEL_MAP) {
      if (!poco.hasOwnProperty(key))
        continue;
      var label = POCO_PUBLISH_AND_LABEL_MAP[key],
          values = poco[key];

      for (var i = 0; i < values.length; i++) {
        var valueObj = values[i],
            id = genUniqueId();

        var itemNode = itemTemplate.cloneNode(), jqItem = $(itemNode);
        jqItem.find('label').attr('for', id).text(label);
        jqItem.find('.value').attr('id', id).text(valueObj.value);

        root.appendChild(itemNode);
      }
    }

    return root;
  }

  /**
   * Common query binding logic.
   *
   * @param listNode The DOM node to root the created nodes under.
   * @param clonable The DOM node to clone (or function to call that takes an
   *                 item object and returns a cloned DOM node).
   * @param propName The JS property name to set on the resulting node that
   *                 holds a reference to the item object.
   * @param query The instantiated moda query.
   * @param frag  The optional document fragment to use to start appending
   *              newly created nodes to.  Only needs to be provided if you
   *              wanted to create one or more sentinel items at the start of
   *              the list.
   */
  function commonQueryBind(listNode, clonable, propName, query, frag) {
    query.on('add', function(itemObj, addedAtIndex) {
      var node = clonable.cloneNode(true);

      updateDom($(node), itemObj);
      // Our use of the linkNode mechanism makes this superfluous.  Keeping it
      // around for the time being for debugging info.
      node.href += '?id=' + encodeURIComponent(itemObj.id);

      node[propName] = itemObj;

      itemObj.on('change', function() {
        // this should still work at runtime because the node instance
        //  should have been re-parented, not cloned, when the fragment
        //  got merged in.
        updateDom($(node), itemObj);
      });
      itemObj.on('remove', function() {
        $(node).remove();
      });

      // XXX currently we are append-only and ignoring ordering hints; need to
      // talk with James to figure out how ordering would best fit with his
      // approach.
      if (!frag)
        frag = document.createDocumentFragment();
      frag.appendChild(node);
    });
    query.on('complete', function() {
      // Update the card.
      listNode.append(frag);
      frag = null;

      // Refresh card sizes.
      cards.adjustCardSizes();
    });
  }
  function commonCardKillQuery(data, node) {
    data.query.destroy();
    data.query = null;
  };


  /**
   * Exists to help us out with the 'peep blurb with private conversation blurb'
   *  hack.  The idea is to issue a query for all peeps and a query for all
   *  conversations, then associate the private conversations (if they exist)
   *  with the peep blurb.
   */
  function compositeQueryBind(listNode, clonable, propName, pieces, frag) {
    var fusionMap = {}, requiredCount = 0;
    function chewPiece(piece, iPiece) {
      if (piece.required)
        requiredCount++;
      piece.query.on('add', function(item) {
        var mappedKey = piece.keyFunc(item);
        // ignore things we are told to ignore
        if (mappedKey === null)
          return;

        var fuser;
        if (!fusionMap.hasOwnProperty(mappedKey)) {
          fuser = fusionMap[mappedKey] = {
            rep: {},
            togo: requiredCount,
            node: null,
            onChange: function(thing) {
              if (fuser.node)
                updateDom($(fuser.node), rep);
            },
            onRemove: function(thing) {
              if (!fuser.node)
                return;
              $(fuser.node).remove();
              fuser.node = null;
            }
          };
        }
        else {
          fuser = fusionMap[mappedKey];
          if (fuser.rep.hasOwnProperty(piece.name))
            throw new Error("Map collision for piece '" + piece.name +
                            "' on key '" + mappedKey + "'");
        }
        if (piece.required)
          fuser.togo--;
        fuser.rep[piece.name] = item;

        if (fuser.togo === 0) {
          var node = fuser.node = clonable.cloneNode(true),
              rep = fuser.rep;

          updateDom($(node), rep);
          node[propName] = rep;

          // XXX currently we are append-only and ignoring ordering hints; need to
          // talk with James to figure out how ordering would best fit with his
          // approach.
          if (!frag)
            frag = document.createDocumentFragment();
          frag.appendChild(node);
        }
      });
      piece.query.on('complete', function() {
        if (!frag)
          return;

        // Update the card.
        listNode.append(frag);
        frag = null;

        // Refresh card sizes.
        cards.adjustCardSizes();
      });
    }
    pieces.forEach(chewPiece);
  }

  /*
   * First page of the signup process; the user identifies themself by name
   * and e-mail address (via BrowserID).  Once completed, we switch to the
   * 'pickServer' card.
   */
  update['signIn'] = function (data, dom) {
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

            me.provideProofOfIdentity({
              type: 'email',
              source: 'browserid',
              assertion: assertion,
              audience: location.hostname +
                        (location.port ? ':' + location.port : '')
            });
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
  };

  /*
   * This page just tells you you don't have a server and then links you to
   * 'pickServer'.  Presumably exists for the unhappy (development) situation
   * where the server does not know who you are anymore.  This should
   * eventually be nuked.
   */
  update['needServer'] = function (data, dom) {
    cards.adjustCardSizes();
  };

  /*
   * Lists (client API hard-coded) servers that can be used plus provides the
   * ability to enter a domain manually.
   */
  update['pickServer'] = function (data, dom) {
    commonQueryBind(dom.find('.scroller'), getChildCloneNode(dom[0]),
                    'server', (data.query = moda.queryServers()));
  };
  remove['pickServer'] = commonCardKillQuery;

  /*
   * Handled by explicit form delegation, see down below.
   */
  update['enterServer'] = null;
  // Form submissions for entering a server.
  jqBody.delegate('[data-cardid="enterServer"] .enterServerForm', 'submit',
    function (evt) {
      evt.preventDefault();
      evt.stopPropagation();

      var domain =
        $(evt.target).find('[name="server"]').val().trim().toLowerCase();
      if (domain) {

        //Fetch the server info
        me.insecurelyGetServerSelfIdentUsingDomainName(domain,
          function (serverInfo) {

          if (!serverInfo) {
            // TODO: Use Andy's better dialogs.
            alert('Domain ' + domain + ' does not support deuxdrop');
            return;
          }

          // Stash in local copy of servers.
          servers.items[serverInfo.localName] = serverInfo;

          update.connectToServer({
            id: serverInfo.localName
          });
        });
      }
    }
  );

  /*
   * Nodeless action that triggers signup.
   */
  update['connectToServer'] = function (data, serverNode) {
    var serverInfo = serverNode.server;

    me.signupWithServer(serverInfo, {
      onCompleted: function (err) {
        if (err) {
          // TODO: make this a pretty Andy dialog.
          alert('Signup failed: ' + err);
          return;
        }

        // Remove the sign in/server setup cards
        // XXX this does not result in onRemove being invoked
        $('[data-cardid="signIn"], [data-cardid="pickServer"], ' +
          '[data-cardid="enterServer"], [data-cardid="needServer"]',
          '#cardContainer').remove();

        // Show the start card
        cards.onNav('start', {});
        moda.connect();

        // Go back one to see the start card.
        history.back();
      }
    });
  };

  /*
   * Lists all friended peeps, providing a gateway to private chat with each
   * of them.  As part of this, the most recent message from the friend is
   * displayed as part of the snippet.
   */
  update['private'] = function (data, dom) {
    // Get the node to use for each peep.
    var clonable = getChildCloneNode(dom[0]),
        frag = document.createDocumentFragment();

    // Put in the Add button.
    frag.appendChild(commonNodes.addPersonLink.cloneNode(true));

    compositeQueryBind(
      dom.find('.scroller'), clonable, 'privBundle',
      [
        {
          name: 'peep',
          required: true,
          query: moda.queryPeeps({ by: 'alphabet' }),
          // Join on the person's id; it is uniqued
          keyFunc: function(peep) {
            return peep.id;
          },
        },
        {
          name: 'conv',
          required: false,
          query: moda.queryAllConversations({ by: 'all' }),
          keyFunc: function(convBlurb) {
            // ignore non-private messages
            if (convBlurb.firstMessage.text !== 'PRIVATE' ||
                convBlurb.participants.length !== 2 ||
                (!convBlurb.participants[0].isMe &&
                 !convBlurb.participants[1].isMe))
              return null;
            var idxNotMe = convBlurb.participants[0].isMe ? 1 : 0;
            return convBlurb.participants[idxNotMe].id;
          },
        }
      ],
      frag);
  };
  remove['private'] = commonCardKillQuery;

  /*
   * Lists all existing conversations; not filtered to a specific person.
   * Provides an affordance to create a new conversation.
   */
  update['groups'] = function(data, dom) {
  };

  /*
   * Lists connection/friend requests.
   */
  update['notifications'] = function(data, dom) {
    commonQueryBind(dom.find('.scroller'), getChildCloneNode(dom[0]),
                    'connReq',
                    (data.query = moda.queryConnectRequests()));
  };

  /*
   * Nodeless action to approve a connect request.
   */
  update['acceptReq'] = function(data, dom, connReqNode) {
    var connReq = connReqNode.connReq;
    updateDom(dom, connReq);
    dom.find('.pocoContainer')
         .append(generatePocoListNode(connReq.peep.selfPoco));
    dom.find('input[name="displayName"]').val(connReq.peep.selfPoco.displayName);

    dom.find('.acceptFriendForm').submit(function(evt) {
        evt.preventDefault();
        var ourPoco = {
          displayName: dom.find('input[name="displayName"]').val().trim(),
        };
        connReq.acceptConnectRequest(ourPoco);
        history.back();
      });
    dom.find('.ignoreFriendForm').submit(function(evt) {
        evt.preventDefault();
        history.back();
      });
    dom.find('.rejectFriendForm').submit(function(evt) {
        evt.preventDefault();
        connReq.rejectConnectRequest();
        history.back();
      });
  };

  /*
   * Asks our server for users who are not currently our friends so that we
   * can add them as friends.
   */
  update['add'] = function(data, dom) {
    commonQueryBind(dom.find('.scroller'), getChildCloneNode(dom[0]),
                    'pfriend',
                    (data.query = moda.queryPossibleFriends()));
  };
  remove['add'] = commonCardKillQuery;

  /*
   * Ask the user to confirm they want to ask someone to be their friend,
   * including including a small message to send with the request.
   */
  update['askFriend'] = function(data, dom, pfriendNode) {
    var peep = pfriendNode.pfriend.peep;
    function handleSubmit(evt) {
      evt.preventDefault();
      evt.stopPropagation();

      var nameDom = dom.find('[name="displayName"]'),
          displayName = nameDom.val().trim(),
          messageDom = dom.find('[name="message"]'),
          message = messageDom.val().trim();

      var ourPocoForPeep = {
        displayName: displayName,
      };
      moda.connectToPeep(peep, ourPocoForPeep, message);

      // nuke this card
      history.back();

      // XXX ideally we would disable attempting to friend the person
      // again at this point.  We do not want to manually trigger a removal
      // because the query should automatically update for us and that should
      // be triggering the animation.
    }
    dom.find('.askFriendForm').submit(handleSubmit);
    dom.find('[name="displayName"]').val(peep.selfPoco.displayName);
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
    else {
      // automatically connect
      moda.connect();
    }

    // The list of #id's that do not correspond to a card, but rather exist
    // just to trigger actions.  These should all trigger navigation once they
    // complete.
    nodelessActions = {
      'doFriend': true,
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
    cards.onNav = function (templateId, data, linkNode) {
      var cardDom;

      if (nodelessActions[templateId]) {
        // A "back" action that could modify the data in a previous card.
        if (update[templateId]) {
          update[templateId](data, linkNode);
        }
      } else {
        // A new action that will generate a new card.
        cardDom = $(cards.templates[templateId].cloneNode(true));
        cardDom[0].cardData = data;

        if (update[templateId]) {
          update[templateId](data, cardDom, linkNode);
        }

        cards.add(cardDom);

        if (!startCardIds[templateId]) {
          cards.forward();
        }
      }
    };

    cards.onRemove = function (cardNode) {
      var cardData = cardNode.cardData;

      var templateId = cardNode.getAttribute('data-cardid');
      if (templateId in remove)
        remove[templateId](cardData, cardNode);
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

    // Set init to null, to indicate init work has already been done.
    init = null;
  };
});
