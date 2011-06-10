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

/*jslint indent: 2, regexp: false */
/*global define: false, window: false, document: false,
  location: false, history: false, setTimeout: false */
'use strict';

define([ 'jquery', 'blade/url', 'blade/array', 'text!./cardsHeader.html'],
function ($,        url,         array,         headerTemplate) {
  var cards, header, display, back, nlCards,
    cardPosition = 0,
    headerText = '',
    cardTitles = [];

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
  }

  function onNavClick(evt, skipPush) {
    var href = evt.target.href,
        fragId = href && href.split('#')[1],
        cardId, data;
    if (fragId) {
      fragId = fragId.split('?');
      cardId = fragId[0];
      data = fragId[1] || '';

      // Convert the data into an object
      data = url.queryToObject(data);

      cards.onNav(cardId, data);

      if (!skipPush && cardId !== 'back') {
        history.pushState({}, cards.getTitle(), href);
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
        cards.back();

        // Remove the last panel
        // TODO: do this in a less hacky way, listen for transitionend for
        // example, if that now works in everywhere we want, and we are
        // using CSS3 transitions.
        setTimeout(function () {
          nlCards.find('.card').last().remove();
        }, 300);
      }, false);

      // Set up initial state via simulation of a nav click
      href = location.href.split('#')[1] || cards.startCardId;

      onNavClick({
        target: {
          href: '#' + href
        },
        stopPropagation: function () {},
        preventDefault: function () {}
      }, true);
    });
  };

  cards.startCardId = 'start';

  cards.templates = {};

  cards.adjustCardSizes = adjustCardSizes;

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
  cards.add = function (node) {
    nlCards.append(node);
    adjustCardSizes();
  };

  cards.back = function () {
    cardPosition -= 1;
    if (cardPosition < 0) {
      cardPosition = 0;
    }
    cards.scroll();
  };

  cards.moveTo = function (id) {
    cardPosition = $('.card').index(document.getElementById(id));
    if (cardPosition < 0) {
      cardPosition = 0;
    }
    cards.scroll();
  };

  cards.forward = function (title) {
    cardPosition += 1;
    cards.scroll(title);
  };

  cards.scroll = function (title) {
    if (title) {
      cardTitles[cardPosition] = title;
    }

    cards.setTitle(title);

    var left = display.outerWidth() * cardPosition;

    nlCards.animate(
      {
        left: '-' + left + 'px'
      }, {
        duration: 300,
        easing: 'linear'
      }
    );

/*
    Was used for CSS -webkit-transition
    nlCards.css({
      left: '-' + left + 'px'
    });
*/
    //Hide/Show back button as appropriate
    back.css('display', !cardPosition ? 'none' : '');
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
