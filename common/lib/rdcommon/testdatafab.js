/* ***** BEGIN LICENSE BLOCK *****
 *   Version: MPL 1.1/GPL 2.0/LGPL 2.1
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
 * The Original Code is Thunderbird Global Database.
 *
 * The Initial Developer of the Original Code is the Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Andrew Sutherland <asutherland@asutherland.org>
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

/**
 * Deterministic made-up (human) name and phrase generator extracted from
 *  previous Thunderbird global database test work.
 **/

define(
  [
    'exports'
  ],
  function(
    exports
  ) {

/**
 * A list of first names for use by MessageGenerator to create deterministic,
 *  reversible names.  To keep things easily reversible, if you add names, make
 *  sure they have no spaces in them!
 */
const FIRST_NAMES = [
  "Andy", "Bob", "Chris", "David", "Emily", "Felix",
  "Gillian", "Helen", "Idina", "Johnny", "Kate", "Lilia",
  "Martin", "Neil", "Olof", "Pete", "Quinn", "Rasmus",
  "Sarah", "Troels", "Ulf", "Vince", "Will", "Xavier",
  "Yoko", "Zig"
  ];

/**
 * A list of last names for use by MessageGenerator to create deterministic,
 *  reversible names.  To keep things easily reversible, if you add names, make
 *  sure they have no spaces in them!
 */
const LAST_NAMES = [
  "Anway", "Bell", "Clarke", "Davol", "Ekberg", "Flowers",
  "Gilbert", "Hook", "Ivarsson", "Jones", "Kurtz", "Lowe",
  "Morris", "Nagel", "Orzabal", "Price", "Quinn", "Rolinski",
  "Stanley", "Tennant", "Ulvaeus", "Vannucci", "Wiggs", "Xavier",
  "Young", "Zig"
  ];

/**
 * A list of adjectives used to construct a deterministic, reversible subject
 *  by MessageGenerator.  To keep things easily reversible, if you add more,
 *  make sure they have no spaces in them!  Also, make sure your additions
 *  don't break the secret Monty Python reference!
 */
const SUBJECT_ADJECTIVES = [
  "Big", "Small", "Huge", "Tiny",
  "Red", "Green", "Blue", "My",
  "Happy", "Sad", "Grumpy", "Angry",
  "Awesome", "Fun", "Lame", "Funky",
  ];

/**
 * A list of nouns used to construct a deterministic, reversible subject
 *  by MessageGenerator.  To keep things easily reversible, if you add more,
 *  make sure they have no spaces in them!  Also, make sure your additions
 *  don't break the secret Monty Python reference!
 */
const SUBJECT_NOUNS = [
  "Meeting", "Party", "Shindig", "Wedding",
  "Document", "Report", "Spreadsheet", "Hovercraft",
  "Aardvark", "Giraffe", "Llama", "Velociraptor",
  "Laser", "Ray-Gun", "Pen", "Sword",
  ];

/**
 * A list of suffixes used to construct a deterministic, reversible subject
 *  by MessageGenerator.  These can (clearly) have spaces in them.  Make sure
 *  your additions don't break the secret Monty Python reference!
 */
const SUBJECT_SUFFIXES = [
  "Today", "Tomorrow", "Yesterday", "In a Fortnight",
  "Needs Attention", "Very Important", "Highest Priority", "Full Of Eels",
  "In The Lobby", "On Your Desk", "In Your Car", "Hiding Behind The Door",
  ];


/**
 * Provides mechanisms for creating vaguely interesting, but at least valid,
 *  SyntheticMessage instances.
 */
function DataFabricator() {
  this._nextNameNumber = 0;
  this._nextSubjectNumber = 0;
}
exports.DataFabricator = DataFabricator;
DataFabricator.prototype = {
  /**
   * The maximum number of unique names makeName can produce.
   */
  MAX_VALID_NAMES: FIRST_NAMES.length * LAST_NAMES.length,
  /**
   * The maximum number of unique e-mail address makeMailAddress can produce.
   */
  MAX_VALID_MAIL_ADDRESSES: FIRST_NAMES.length * LAST_NAMES.length,
  /**
   * The maximum number of unique subjects makeSubject can produce.
   */
  MAX_VALID_SUBJECTS: SUBJECT_ADJECTIVES.length * SUBJECT_NOUNS.length *
                      SUBJECT_SUFFIXES,

  /**
   * Generate a consistently determined (and reversible) name from a unique
   *  value.  Currently up to 26*26 unique names can be generated, which
   *  should be sufficient for testing purposes, but if your code cares, check
   *  against MAX_VALID_NAMES.
   *
   * @param aNameNumber The 'number' of the name you want which must be less
   *     than MAX_VALID_NAMES.
   * @returns The unique name corresponding to the name number.
   */
  makeName: function(aNameNumber) {
    if (aNameNumber === undefined)
      aNameNumber = this._nextNameNumber++;

    var iFirst = aNameNumber % FIRST_NAMES.length;
    var iLast = (iFirst + Math.floor(aNameNumber / FIRST_NAMES.length)) %
                LAST_NAMES.length;

    return FIRST_NAMES[iFirst] + " " + LAST_NAMES[iLast];
  },

  /**
   * Generate a consistently determined (and reversible) subject from a unique
   *  value.  Up to MAX_VALID_SUBJECTS can be produced.
   *
   * @param aSubjectNumber The subject number you want generated, must be less
   *     than MAX_VALID_SUBJECTS.
   * @returns The subject corresponding to the given subject number.
   */
  makeSubject: function(aSubjectNumber) {
    if (aSubjectNumber === undefined)
      aSubjectNumber = this._nextSubjectNumber++;
    var iAdjective = aSubjectNumber % SUBJECT_ADJECTIVES.length;
    var iNoun = (iAdjective + Math.floor(aSubjectNumber /
                                         SUBJECT_ADJECTIVES.length)) %
                SUBJECT_NOUNS.length;
    var iSuffix = (iNoun + Math.floor(aSubjectNumber /
                   (SUBJECT_ADJECTIVES.length * SUBJECT_NOUNS.length))) %
                  SUBJECT_SUFFIXES.length;
    return SUBJECT_ADJECTIVES[iAdjective] + " " +
           SUBJECT_NOUNS[iNoun] + " " +
           SUBJECT_SUFFIXES[iSuffix];
  },
};

var gFakeDataMaker = null;
/**
 * Return a single fake data maker so that different test helpers can allocate
 *  fake data without producing duplicate strings, thereby confusing people.
 */
exports.gimmeSingletonFakeDataMaker = function() {
  if (!gFakeDataMaker)
    gFakeDataMaker = new DataFabricator();
  return gFakeDataMaker;
};

}); // end define
