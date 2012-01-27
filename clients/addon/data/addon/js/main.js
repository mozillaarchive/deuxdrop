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

    var matches = rootDom.find('[data-bind]');
    // allow the root to match
    if (rootDom[0].hasAttribute('data-bind'))
      matches = matches.add(rootDom[0]);
    matches.each(function (i, node) {
      var bindName = node.getAttribute('data-bind'),
          attrName = node.getAttribute('data-attr'),
          missing = false, missingAction, value, parts;

      // Allow for dot names in the bindName
      if (bindName.indexOf('.') !== -1) {
        parts = bindName.split('.');
        value = model;
        parts.forEach(function (part) {
          if (value != null)
            value = value[part];
        });
      }
      else {
        value = model[bindName];
      }
      if (value == null)
        missing = true;

      if (missing && (missingAction = node.getAttribute('data-missing'))) {
        if (missingAction === "OMIT")
          return;
        value = missingAction;
        // convert missing dates into straight-up text mappings (this pass only)
        if (attrName === 'data-time')
          attrName = null;
      }

      if (attrName) {
        // special handling for (auto-updating) dates
        if (attrName === 'data-time') {
          $(node).text(friendly.date(value).friendly);
          node.setAttribute(attrName, value.valueOf());
        }
        else {
          node.setAttribute(attrName, value);
        }
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

        var itemNode = itemTemplate.cloneNode(true), jqItem = $(itemNode);
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
   * @param [updateDomFunc] A function to update the DOM node, if you don't
   *                        provide one, we just use the updateDom module
   *                        global.  You'll need to provide a custom one if
   *                        you have repeated nested elements; as the current
   *                        James-idiom does not have magic for that.  (Maybe
   *                        blade does?)
   */
  function commonQueryBind(listNode, clonable, propName, query, frag,
                           updateDomFunc) {
    if (!updateDomFunc)
      updateDomFunc = updateDom;
    var cloneFunc;
    if (typeof(clonable) === 'function') {
        cloneFunc = clonable;
    }
    else {
      cloneFunc = function() {
        return clonable.cloneNode(true);
      };
    }
    query.on('add', function(itemObj, addedAtIndex) {
      var node = cloneFunc(itemObj);
      // bail if no node was produced; (poor man's stopgap filtering)
      if (!node)
        return;
      var jqNode = $(node);

      updateDomFunc(jqNode, itemObj, null);

      node[propName] = itemObj;

      itemObj.on('change', function(itemObj, liveset, whatChanged) {
        // this should still work at runtime because the node instance
        //  should have been re-parented, not cloned, when the fragment
        //  got merged in
        updateDomFunc(jqNode, itemObj, whatChanged);
      });
      itemObj.on('remove', function() {
        jqNode.remove();
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
  function commonQueryKill(data, node) {
    data.query.destroy();
    data.query = null;
  };


  /**
   * Exists to help us out with the 'peep blurb with private conversation blurb'
   *  hack.  The idea is to issue a query for all peeps and a query for all
   *  conversations, then associate the private conversations (if they exist)
   *  with the peep blurb.
   */
  function compositeQueryBind(listNode, clonable, propName, data, pieces,
                              onAllComplete, updateDomFunc) {
    var fusionMap = {}, requiredCount = 0, queriesLeft = pieces.length,
        reps = [], newReps = [], pendingFlush = false, frag;
    if (!updateDomFunc)
      updateDomFunc = updateDom;

    data.pieces = pieces;
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
                updateDomFunc($(fuser.node), rep);
            },
            onRemove: function(thing) {
              if (!fuser.node)
                return;
              $(fuser.node).remove();
              fuser.node = null;
              reps.splice(reps.indexOf(fuser.rep), 1);
            }
          };
          reps.push(fuser.rep);
          newReps.push(fuser.rep);
        }
        else {
          fuser = fusionMap[mappedKey];
          if (fuser.rep.hasOwnProperty(piece.name)) {
            console.error("Map collision", piece.name, mappedKey);
            return;
          }
        }
        fuser.rep[piece.name] = item;

        item.on('change', fuser.onChange);
        // (in theory, we should only remove for required removals, and just
        //  update in other cases.)
        item.on('remove', fuser.onRemove);

        if (piece.required) {
          fuser.togo--;
          if (fuser.togo === 0) {
            var node = fuser.node = clonable.cloneNode(true),
                rep = fuser.rep;

            updateDomFunc($(node), rep);
            node[propName] = rep;

            // XXX currently we are append-only and ignoring ordering hints;
            // need to talk with James to figure out how ordering would best fit
            // with his approach.
            if (!frag)
              frag = document.createDocumentFragment();
            frag.appendChild(node);
          }
        }
        // if the underlying data is already there, generate a change
        else if (fuser.togo === 0) {
          fuser.onChange();
        }
      });
      function handleComplete() {
        pendingFlush = false;

        // generate the completion notification:
        if (onAllComplete) {
          try {
            onAllComplete(newReps);
          }
          catch (ex) {
            console.error("onAllComplete threw", ex);
          }
        }
        newReps = [];

        if (!frag)
          return;

        // Update the card.
        listNode.append(frag);
        frag = null;

        // Refresh card sizes.
        cards.adjustCardSizes();
      };
      piece.query.on('complete', function() {
        // - Incremental Update?
        if (queriesLeft === 0) {
          // It's possible there are more query results coming, and they
          //  should be happening real soon now, so let's give them some time
          //  to happen.  We would probably be better off waiting for a
          //  replica update complete notification if we generated one, but
          //  our current usage is a hack in general right now, so this is fine.
          //  (Which is to say, a mutating event triggered by a view is a fairly
          //  horrible idea, especially with the inherent race.  The private
          //  conversation needs to move down the stack if we keep it.)
          if (!pendingFlush) {
            setTimeout(handleComplete, 200);
            pendingFlush = true;
          }
          return;
        }
        // If we are still waiting on queries, keep waiting.
        if (--queriesLeft > 0) {
          return;
        }
        // Last query just completed, so process immediately.
        handleComplete();
      });
    }
    pieces.forEach(chewPiece);
  }
  function compositeQueryKill(data, node) {
    data.pieces.forEach(function(piece) {
      piece.query.destroy();
      piece.query = null;
    });
  }

  /**
   * Cause a convmsgs query to mark the last message in it as read.
   */
  function hookupMsgsQueryToMarkAsRead(query) {
    query.on('complete', function() {
      query.items[query.items.length - 1].markAsLastReadMessage();
    });
  }

  //////////////////////////////////////////////////////////////////////////////
  // Signup Process

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
            cards.terseNav('pickServer', {});
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
  remove['pickServer'] = commonQueryKill;

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
        /*
        $('[data-cardid="signIn"], [data-cardid="pickServer"], ' +
          '[data-cardid="enterServer"], [data-cardid="needServer"]',
          '#cardContainer').remove();
        */

        // We are now in a design hole in cards.js.  We want to get rid of all
        //  the other cards and show only our cards.

        // Let's just re-establish our UI from scratch.
        document.location = 'about:dd';

        /*
        // Show the start card
        cards.onNav('start', {});
        moda.connect();
        */
      }
    });
  };

  //////////////////////////////////////////////////////////////////////////////
  // Conversation Display

  /*
   * Lists all friended peeps, providing a gateway to private chat with each
   * of them.  As part of this, the most recent message from the friend is
   * displayed as part of the snippet.
   */
  update['private'] = function (data, dom) {
    // Get the node to use for each peep.
    var clonable = getChildCloneNode(dom[0]);

    compositeQueryBind(
      dom.find('.scroller'), clonable, 'privBundle', data,
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
      function allComplete(bundles) {
        // Create private conversations where none currently exist.
        // (We don't create them on demand because creating a conversation does
        //  not immediately return a blurb; instead we need to wait for server
        //  round-tripping, so it behooves us to get them created NOW.)
        for (var i = 0; i < bundles.length; i++) {
          var bundle = bundles[i];
          if (bundle.conv)
            continue;

          moda.createConversation({
            peeps: [bundle.peep],
            text: 'PRIVATE',
          });
        }
      },
      function updom(jqNode, bundle) {
        updateDom(jqNode, bundle);
        if (bundle.conv)
          jqNode.toggleClass("unread", bundle.conv.numUnreadMessages > 0);
      });
  };
  remove['private'] = compositeQueryKill;

  /*
   * Private chat conversation display.
   */
  update['privateConv'] = function(data, dom, clickedBundleNode) {
    var bundle = clickedBundleNode.privBundle;

    // - jerkily bail if the conversation has not shown up yet.
    if (!bundle.conv) {
      alert("waiting for the server to acknowledge stuffs, try again laterz");
      history.back();
      return;
    }

    var query = data.query = moda.queryConversationMessages(bundle.conv);
    hookupMsgsQueryToMarkAsRead(query);
    var conv = query.blurb,
        peep = conv.participants[conv.participants[0].isMe ? 1 : 0],
        me = conv.participants[conv.participants[0].isMe ? 0 : 1],
        composite = { conv: conv, peep: peep, me: me },
        jqHeader = dom.find('.bigSubHeader');

    function updom() {
      updateDom(jqHeader, composite);
    }
    conv.on('change', updom);
    peep.on('change', updom);
    updom();

    // - messages
    var jqContainerNode = dom.find('.privateConversation'),
        cloneNode = getChildCloneNode(jqContainerNode[0]);
    commonQueryBind(
      jqContainerNode,
      function cloner(message) {
        // ignore joins in private conversations (although our failure mode
        //  under jerk-phenomenon where the other party looks someone else into
        //  your conversation is off the charts then...)
        if (message.type === 'join')
          return null;
        var clone = cloneNode.cloneNode(true);
        if (message.author.isMe)
          $(clone).addClass('fromMe');
        else
          $(clone).addClass('toMe');
        return clone;
      },
      'conv',
      data.query, null,
      function updomMessage(jqNode, item, whatChanged) {
        // update for the straighforward stuff
        updateDom(jqNode, item);
        // remove the DOM attr if anything got unmarked
        if (whatChanged && whatChanged.unmark) {
          jqNode.removeAttr('watermark');
        }
        // set the watermark DOM attr if it's the other guy
        for (var i = 0; i < item.mostRecentReadMessageBy.length; i++) {
          var peep = item.mostRecentReadMessageBy[i];
          if (!peep.isMe)
            jqNode.attr('watermark', 'true');
        }
      });
  };
  remove['privateConv'] = commonQueryKill;
  // XXX this is exactly the logic from groupConv, copy-paste-modified.
  jqBody.delegate('[data-cardid="privateConv"] .compose', 'submit',
    function(evt) {
      evt.preventDefault();
      evt.stopPropagation();

      var jqCard = $(evt.target).closest('[data-cardid="privateConv"]');
      var convBlurb = jqCard[0].cardData.query.blurb;

      var jqText = $(evt.target).find('[type="text"]');

      convBlurb.replyToConversation({
        text: jqText.val(),
      });

      // - clear the text they entered so they can write more!
      jqText.val('');
    }
  );

  /*
   * Lists all existing conversations; not filtered to a specific person.
   * Provides an affordance to create a new conversation.
   */
  update['groups'] = function(data, dom) {
    var clonable = getChildCloneNode(dom[0]);
    commonQueryBind(
      dom.find('.scroller'),
      function makeClone(convBlurb) {
        // XXX poor man's filtration of private chats
        if (convBlurb.firstMessage && convBlurb.firstMessage.text === 'PRIVATE')
          return null;
        return clonable.cloneNode(true);
      },
      'conv',
      (data.query = moda.queryAllConversations({ by: 'all' })), null,
      function updom(jqNode, convBlurb, whatChanged) {
        // okay, so whatChanged knows all kinds of useful stuff, but in order
        //  to be able to invoke updateDom at a high level, we need to nuke
        //  all the cloned children before doing so, so let's not optimize
        //  for the nitty gritty.
        var jqPartRoot = jqNode.find('.namechecks'),
            partClonable = getChildCloneNode(jqPartRoot[0]);

        // - nuke all clone child points
        jqPartRoot.empty();

        // - update the blurb
        updateDom(jqNode, convBlurb);

        // - clone children
        convBlurb.participants.forEach(function(peepBlurb) {
          var jqPartNode = $(partClonable.cloneNode(true));
          updateDom(jqPartNode, peepBlurb);
          jqPartRoot.append(jqPartNode);
        });
      });
  };
  remove['groups'] = commonQueryKill;

  /*
   * Display the contents of a group conversation.
   *
   * Display is somewhat special in that we have a header at the top of the
   *  conversation that displays data based on the associated conversation
   *  blurb, so we use a commonQueryBind plus specialized display for the
   *  participants (which looks sorta similar to what we do for the 'groups'
   *  card).
   */
  update['groupConv'] = function(data, dom, convNode) {
    data.query = moda.queryConversationMessages(convNode.conv);
    hookupMsgsQueryToMarkAsRead(data.query);

    // - convblurb header
    // (a lot of this logic is similar to the groups items)
    var jqHeader = dom.find('.subHeader'),
        jqPartRoot = jqHeader.find('.participants'),
        partClonable = getChildCloneNode(jqPartRoot[0]);
    function updateHeader(blurb) {
      // - nuke clone child points
      jqPartRoot.empty();

      // - update the header generally
      updateDom(jqHeader, blurb);

      // - clone children
      blurb.participants.forEach(function(peepBlurb) {
        var jqPartNode = $(partClonable.cloneNode(true));
        updateDom(jqPartNode, peepBlurb);
        jqPartRoot.append(jqPartNode);
      });
    }
    data.query.blurb.on('change', updateHeader);
    updateHeader(data.query.blurb);

    // - messages
    commonQueryBind(
      dom.find('.conversation'),
      function cloner(message) {
        return commonNodes[message.type].cloneNode(true);
      },
      'conv',
      data.query);
  };
  remove['groupConv'] = commonQueryKill;
  /* add more peeps to the conversation */
  jqBody.delegate('[data-cardid="groupConv"] .add', 'click',
    function(evt) {
      var jqCard = $(evt.target).closest('[data-cardid="groupConv"]'),
          data = jqCard[0].cardData,
          participants = data.query.blurb.participants,
          peepsQuery = moda.queryPeeps({ by: 'alphabet' });

      function doInvitePeeps(toInvite) {
        toInvite.forEach(function(peep) {
          data.query.blurb.inviteToConversation(peep);
        });
        cleanup();
      }
      function cleanup() {
        peepsQuery.destroy();
      }

      // wait until we get our query
      peepsQuery.on('complete', function() {
        // - filter out the already-added peeps
        var candidates = peepsQuery.items.filter(function(candPeep) {
                           return !participants.some(function(xpeep) {
                             return xpeep.id === candPeep.id;
                           });
                         });

        cards.terseNav('pickPeeps',
              {
                candidates: candidates,
                appendTo: null,
                callback: doInvitePeeps,
                cleanup: cleanup,
              });
        }
      );
    }
  );
  jqBody.delegate('[data-cardid="groupConv"] .compose', 'submit',
    function(evt) {
      evt.preventDefault();
      evt.stopPropagation();

      var jqCard = $(evt.target).closest('[data-cardid="groupConv"]');
      var convBlurb = jqCard[0].cardData.query.blurb;

      var jqText = $(evt.target).find('[type="text"]');

      convBlurb.replyToConversation({
        text: jqText.val(),
      });

      // - clear the text they entered so they can write more!
      jqText.val('');
    }
  );

  //////////////////////////////////////////////////////////////////////////////
  // Conversation Modification (New, Add Person, etc.)

  /*
   * Create a new conversation!
   */
  update['newConv'] = function(data, dom) {
    // get a list of all known peeps
    var query = data.query = moda.queryPeeps({ by: 'alphabet' });
    // maintain a list of participants that is a subset of/kept alive by the
    //  above query.
    data.participants = [];


    var jqPartRoot = dom.find('.participants'),
        partClonable = getChildCloneNode(jqPartRoot[0]);
    data.updateParticipantsUI = function() {
      jqPartRoot.empty();
      data.participants.forEach(function(peepBlurb) {
        var jqPartNode = $(partClonable.cloneNode(true));
        updateDom(jqPartNode, peepBlurb);
        jqPartRoot.append(jqPartNode);
      });
    };
  };
  remove['newConv'] = commonQueryKill;
  /* add more peeps to the conversation */
  jqBody.delegate('[data-cardid="newConv"] .add', 'click',
    function(evt) {
      var jqCard = $(evt.target).closest('[data-cardid="newConv"]'),
          data = jqCard[0].cardData,
          participants = data.participants;

      // - filter out the already-added peeps
      var candidates = data.query.items.filter(function(candPeep) {
                           return participants.indexOf(candPeep) === -1;
                         });

      // - open a pickPeeps tab that uses the static list
      cards.terseNav('pickPeeps',
            {
              candidates: candidates,
              appendTo: participants,
              callback: data.updateParticipantsUI
            });
    }
  );
  /* send the new conversation */
  jqBody.delegate('[data-cardid="newConv"] .compose', 'submit',
    function(evt) {
      evt.preventDefault();
      evt.stopPropagation();

      var jqCard = $(evt.target).closest('[data-cardid="newConv"]'),
          data = jqCard[0].cardData;

      var jqText = $(evt.target).find('[type="text"]'),
          text = jqText.val();

      // ignore clicks if there are no participants or no text
      // XXX provide some type of alert about something being missing
      if (!text || !data.participants.length)
        return;

      moda.createConversation({
        peeps: data.participants,
        text: text,
      });

      // okay, conversation created, kill the card.
      history.back();
    }
  );

  /*
   * Pick peeps; select one or more peeps from a full-page list of peeps.
   *  Picking is concluded once a big "done" button is hit (for now).
   *
   * @param data.candidates
   * @param [data.appendTo] optional list for us to append our selected results
   *                        to.
   * @param data.callback callback to invoke when completed.  The callback is
   *                      passed the list of selected peeps.
   */
  update['pickPeeps'] = function(data, dom) {
    var scroller = dom.find('.scroller'),
        clonable = getChildCloneNode(scroller[0]);

    data.candidates.forEach(function(peep) {
      var node = clonable.cloneNode(true);
      node.peep = peep;
      updateDom($(node), peep);
      scroller.append(node);
    });
  };
  // no cleanup; we don't issue queries
  remove['pickPeeps'] = null;
  /* clicking a peep toggles their checked state */
  jqBody.delegate('[data-cardid="pickPeeps"] .checkable', 'click',
    function(evt) {
      $(evt.target).closest('.checkable').toggleClass('checked');
    }
  );
  /* clicking the done button updates the list and triggers the callback */
  jqBody.delegate('[data-cardid="pickPeeps"] .done', 'click',
    function(evt) {
      var jqCard = $(evt.target).closest('[data-cardid="pickPeeps"]'),
          data = jqCard[0].cardData;

      var toAdd = jqCard
                    .find('.checked')
                    .map(function(i, x) { return x.peep; })
                    .get();
      if (data.appendTo)
        data.appendTo.push.apply(data.appendTo, toAdd);
      data.callback(toAdd);
      // make our card go away
      history.back();
    }
  );

  //////////////////////////////////////////////////////////////////////////////
  // User details

  update['user'] = function(data, dom, coercableNode) {
    var prevCardNode = cards.allCards().slice(-2, -1)[0],
        prevPeep;
    if (coercableNode.hasOwnProperty('peep'))
      prevPeep = coercableNode.peep;
    else if (coercableNode.hasOwnProperty('conv'))
      prevPeep = coercableNode.conv.author;
    else
      throw new Error("Unable to coerce peep from link node");

    var userQuery = data.query =
          prevCardNode.cardData.query.cloneSlice([prevPeep]),
        peep = userQuery.items[0];
    function updom() {
      updateDom(dom, peep);
      dom.find('.pocoContainer').empty().append(
        generatePocoListNode(peep.selfPoco));
    }
    peep.on('change', updom);
    updom();
  };
  remove['user'] = commonQueryKill;

  //////////////////////////////////////////////////////////////////////////////
  // Friending / contact establishment

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
  remove['add'] = commonQueryKill;

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
    updateDom(dom, peep);
    dom.find('.askFriendForm').submit(handleSubmit);
    dom.find('[name="displayName"]').val(peep.selfPoco.displayName);
    dom.find('.pocoContainer').append(
        generatePocoListNode(peep.selfPoco));
  };

  //////////////////////////////////////////////////////////////////////////////


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

    /**
     * Generate a navigation that does not do any query paramater stuff but
     *  does update the history.
     */
    cards.terseNav = function terseNav(templateId, data, linkNode) {
      cards.onNav(templateId, data, linkNode);
      var href = "#" + templateId;
      history.pushState({}, cards.getTitle(), href);
    };

    cards.onRemove = function (cardNode) {
      var cardData = cardNode.cardData;

      var templateId = cardNode.getAttribute('data-cardid');
      if (remove[templateId])
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
