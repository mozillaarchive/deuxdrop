/**
 * @license blade/array Copyright (c) 2010, The Dojo Foundation All Rights Reserved.
 * Available via the MIT, GPL or new BSD license.
 * see: http://github.com/jrburke/blade for details
 */
/*jslint  nomen: false, plusplus: false */
/*global define: false */

'use strict';

define([], function () {
    var ostring = Object.prototype.toString,
        ap = Array.prototype,
        aps = ap.slice,

        array = {
            /**
             * Determines if the input a function.
             * @param {Object} it whatever you want to test to see if it is a function.
             * @returns Boolean
             */
            is: function (it) {
                return ostring.call(it) === "[object Array]";
            },

            /**
             * Converts an array-like thing into a real array
             * @param{ArrayLike} arrayLike something that looks like an array,
             * has a length and can access members via indices.
             * @returns {Array}
             */
            to: function (arrayLike) {
                return aps.call(arrayLike, 0);
            }
        };

    return array;
});
