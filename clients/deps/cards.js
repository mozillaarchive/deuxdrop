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
/*global require: false, define: false, window: false, document: false, cards: true */
'use strict';

define([ 'jquery', 'text!./cardsHeader.html'],
function ($,    headerTemplate) {
  var header, display, back, nlCards,
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

  function cards(nl, options) {
    nl = nl.jquery ? nl : $(nl);

    $(function () {
      //Insert the header before the cards
      header = $(headerTemplate).insertBefore(nl);
      headerText = $('#headerText');

      back = $('#back');
      back.css('display', 'none');
      back.click((options && options.onBack) || cards.back);

      display = nl;
      nlCards = display.find('#cards');

      adjustCardSizes();
      cards.setTitle(options && options.title);

      //Detect orientation changes and size the card container size accordingly.
      if ('onorientationchange' in window) {
        window.addEventListener('orientationchange', adjustCardSizes, false);
      }
      window.addEventListener('resize', adjustCardSizes, false);

    });
  }

  cards.adjustCardSizes = adjustCardSizes;

  /**
   * Adds a new card to the list of cards, at the end of the cards.
   * Only adds the card, does not navigate to it. Only adds the card
   * if a DOM element with the info.id does not already exist in the page.
   *
   * @param {Object} info the info about the card. It must have the following
   * properties:
   * @param {String} info.id the ID to use for the new card's DOM element.
   * @param {String} info.title the text title to use for the card.
   * @param {String} info.content a string of HTML to use for the content.
   */
  cards.add = function (info) {
    var existing = $('#' + info.id),
      title = info.title;

    if (!title) {
      title = info.content.match(/<h1>([^<]+)<\/h1>/);
      title = (title && title[1]) || '';
    }

    if (!existing.length) {
      existing = $('<div id="' + info.id + '" class="card" title="' + title + '">' + info.content + '</div>')
        .appendTo('#cards');
      cards.adjustCardSizes();
    }

    return existing[0];
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

  cards.setTitle = function (title) {
    title = title || cardTitles[cardPosition] || nlCards.find('.card').eq(cardPosition).attr('title') || '';
    headerText.html(title);
  };

  return cards;
});
