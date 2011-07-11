/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Raindrop.
 *
 * The Initial Developer of the Original Code is
 * Mozilla Messaging, Inc..
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 * */

/*jslint indent: 2, regexp: false, plusplus: false */
/*global define: false, window: false, document: false,
  location: false, history: false, setTimeout: false */
'use strict';

define([ 'jquery', 'blade/url', 'blade/array', 'text!./cardsHeader.html',
        'iscroll'],
function ($,        url,         array,         headerTemplate) {
  var cards, header, display, back, nlCards,
      cardPosition = 0,
      headerText = '',
      cardTitles = [],
      scrollCounter = 0,
      scrollRegistry = {},
      //iScroll just defines a global, bind to it here
      IScroll = window.iScroll;

  function adjustCardSizes() {
    var cardWidth = display.outerWidth(),
      cardList = $('.card'),
      totalWidth = cardWidth * cardList.length,
      height = window.innerHeight - header.outerHeight();

    //Set height
    display.css('height', height + 'px');

    //Set widths and heights of cards. Need to set the heights
    //explicitly so any card using iscroll will get updated correctly.
    nlCards.css({
      width: totalWidth + 'px',
      height: height + 'px'
    });

    cardList.css({
      width: cardWidth + 'px',
      height: height + 'px'
    });

    //Reset the scroll correctly.
    cards.scroll();

    //Update the scrollers.
    nlCards.find('[data-scrollid]').each(function (i, node) {
      var scrollId = node.getAttribute('data-scrollid'),
          scroller = scrollRegistry[scrollId];
      if (scroller) {
        scroller.refresh();
      }
    });
  }

  function parseUrl(node) {
    node = node || location;
    var result = {},
        fragId, data, cardId;

    while (node && !node.href) {
      node = node.parentNode;
    }
    if (!node) {
      return result;
    }

    result.href = node.href;
    fragId = result.href.split('#')[1];

    if (fragId) {
      fragId = fragId.split('?');
      cardId = fragId[0];
      data = fragId[1] || '';

      // Convert the data into an object
      data = url.queryToObject(data);

      result.cardId = cardId;
      result.data = data;
    }

    return result;
  }

  function onNavClick(evt, skipPush) {
    var node = evt.target,
        nav = parseUrl(node);
    if (nav.cardId) {
      cards.onNav(nav.cardId, nav.data);

      if (!skipPush && nav.cardId !== 'back' &&
        (!node.getAttribute || !node.getAttribute('data-nonav'))) {
        history.pushState({}, cards.getTitle(), nav.href);
      }

      // Stop the event.
      evt.stopPropagation();
      evt.preventDefault();
    }
  }

  cards = function (nl, options) {
    nl = nl.jquery ? nl : $(nl);

    cards.options = options || {};

    $(function () {
      var cardNodes, href;

      // insert the header before the cards
      header = $(headerTemplate).insertBefore(nl);
      headerText = $('#headerText');

      back = $('#back');
      back.css('display', 'none');
      back.click(function (evt) {
        history.back();
      });

      display = nl;
      nlCards = display.find('#cards');

      adjustCardSizes();
      cards.setTitle(options && options.title);

      // grab the cards for use later
      cardNodes = array.to(nl.find('[data-cardid]'));

      // store the cards by data-cardid value, and take them out of
      // the DOM and only add them as needed
      cardNodes.forEach(function (node) {
        var id = node.getAttribute('data-cardid');
        if (cards.templates[id]) {
          throw new Error('Duplicate card data-cardid: ' + id);
        } else {
          cards.templates[id] = node;
        }

        node.parentNode.removeChild(node);
      });

      // detect orientation changes and size the card container
      // size accordingly
      if ('onorientationchange' in window) {
        window.addEventListener('orientationchange', adjustCardSizes, false);
      }
      window.addEventListener('resize', adjustCardSizes, false);

      // Listen for clicks. Using clicks instead of hashchange since
      // pushState API does not trigger hashchange events.
      // Only listen for clicks that are on a tags and for # URLs, whose
      // format matches #cardId?name=value&name=value
      $('body').delegate('a', 'click', onNavClick);

      // Listen for popstate to do the back navigation.
      window.addEventListener('popstate', function (evt) {

        var nav = parseUrl(),
            cardsDom = cards.allCards(),
            cardId = nav.cardId || cardsDom[0].getAttribute('data-cardid'),
            i, index, cardNode;

        // find the card in the history that matches the current URL
        for (i = cardsDom.length - 1; i > -1 && (cardNode = cardsDom[i]); i--) {
          if (cardNode.getAttribute('data-cardid') === cardId) {
            index = i;
            break;
          }
        }

        cards.moveTo(index);

        // Remove the panels after the index.
        // TODO: do this in a less hacky way, listen for transitionend for
        // example, if that now works in everywhere we want, and we are
        // using CSS3 transitions.
        setTimeout(function () {
          var removed = cardsDom.slice(index + 1).remove();

          // Remove scrollers.
          removed.each(function (i, node) {
            var scrollId = node.getAttribute('data-scrollid'),
                scroller = scrollRegistry[scrollId];
            if (scroller) {
              scroller.destroy();
              delete scrollRegistry[scrollId];
            }
          });
        }, 300);
      }, false);

      // Set up initial state via simulation of a nav click
      href = location.href.split('#')[1] || cards.startCardId;

      cards.nav(href, null, true);

      cards.onReady();
    });
  };

  cards.startCardId = 'start';

  cards.nav = function (templateId, data, skipPushState) {
    onNavClick({
      target: {
        href: '#' + templateId + (data ? '?' + url.objectToQuery(data) : '')
      },
      stopPropagation: function () {},
      preventDefault: function () {}
    }, skipPushState);
  };

  cards.templates = {};

  cards.adjustCardSizes = adjustCardSizes;

  // Triggered when the cards are ready after initialization. Override
  // in app logic.
  cards.onReady = function () {};

  /**
   * Triggered on card navigation that goes forward. Back navigation is
   * handled automatically. Override in an app to provide navigation behavior.
   */
  cards.onNav = function (templateId, data) {
    throw new Error('Need to implement cards.onNav');
  };

  /**
   * Adds a card node to the list.
   */
  cards.add = function (nodeOrDom) {
    var scrollId = 'id' + (scrollCounter++),
      dom = $(nodeOrDom);

    nlCards.append(nodeOrDom);
    adjustCardSizes();

    // Set up scroller.
    if (!dom.hasClass('noiscroll')) {
      scrollRegistry[scrollId] = new IScroll(dom[0]);
      dom.attr('data-scrollid', scrollId);
    }
  };

  cards.getIScroller = function (nodeOrDom) {
    var dom = $(nodeOrDom);
    return scrollRegistry[dom.attr('data-scrollid')];
  };

  cards.back = function () {
    cardPosition -= 1;
    if (cardPosition < 0) {
      cardPosition = 0;
    }

    //Restore showing text inputs on old current card (see forward)
    nlCards.find('.card').eq(cardPosition).find('.inputHidden').removeClass('inputHidden');

    cards.scroll();
  };

  cards.moveTo = function (position) {
    cardPosition = position;
    if (cardPosition < 0) {
      cardPosition = 0;
    }

    //Restore showing text inputs on old current card (see forward)
    nlCards.find('.card').eq(cardPosition).find('.inputHidden').removeClass('inputHidden');

    cards.scroll();
  };

  cards.forward = function (title) {
    //Hide text inputs on old current card, so that mobile firefox
    //does not put the up/down arrow UI on the screen to jump to them.
    nlCards.find('.card').eq(cardPosition).find('input, textarea').addClass('inputHidden');
    cardPosition += 1;
    cards.scroll(title);
  };

  cards.scroll = function (title) {
    if (title) {
      cardTitles[cardPosition] = title;
    }

    cards.setTitle(title);

    var left = display.outerWidth() * cardPosition;

/*
    // Non-css transition route.
    nlCards.animate(
      {
        left: '-' + left + 'px'
      }, {
        duration: 300,
        easing: 'linear'
      }
    );
*/

    // Relies on CSS transitions for animation.
    nlCards.css({
      left: '-' + left + 'px'
    });

    //Hide/Show back button as appropriate
    back.css('display', !cardPosition ? 'none' : '');
  };

  cards.currentCard = function () {
    return nlCards.find('.card').last();
  };

  cards.allCards = function () {
    return nlCards.find('.card');
  };

  cards.getTitle = function () {
    return nlCards.find('.card').last().attr('title') || '';
  };

  cards.setTitle = function (title) {
    title = title || cardTitles[cardPosition] || nlCards.find('.card').eq(cardPosition).attr('title') || '';
    headerText.html(title);
  };

  return cards;
});
