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

/*jslint plusplus: false, nomen: false */
/*global define: false */
"use strict";

define(function () {
    var friendly = {
        timestamp: function (timestamp) {
            return friendly.date(new Date(timestamp * 1000));
        },

        date: function (date) {
            var diff = (((new Date()).getTime() - date.getTime()) / 1000),
                day_diff = Math.floor(diff / 86400),
                dObj = { "friendly" : date.toLocaleDateString(),
                        "additional" : date.toLocaleTimeString(),
                        "utc" : date.toUTCString(),
                        "locale" : date.toLocaleString() };
            /* some kind of error */
            if (day_diff < 0) {
                dObj.friendly = "in the future";
                return dObj;
            } else if (isNaN(day_diff)) {
                dObj.friendly = dObj.additional = "unknown";
                return dObj;
            }

            if (day_diff === 0) {
                if (diff < 60) {
                    dObj.friendly = "just now";
                    return dObj;
                }
                if (diff < 120 + 30) { /* 1 minute plus some fuzz */
                    dObj.friendly = "a minute ago";
                    return dObj;
                }
                if (diff < 3600) {
                    dObj.friendly = Math.floor(diff / 60) + " minutes ago";
                    return dObj;
                }
                if (diff < (60 * 60) * 2) {
                    dObj.friendly = "1 hour ago";
                    return dObj;
                }
                if (diff < 24 * 60 * 60) {
                    dObj.friendly = Math.floor(diff / 3600) + " hours ago";
                    return dObj;
                }
            }
            if (day_diff === 1) {
                dObj.friendly = "yesterday";
                return dObj;
            }
            if (day_diff < 7) {
                dObj.friendly = day_diff + " days ago";
                return dObj;
            }
            if (day_diff < 8) {
                dObj.friendly = "last week";
                return dObj;
            }
            /* for this scope: we want day of week and the date
                 plus the month (if different) */
            if (day_diff < 31) {
                dObj.friendly = Math.ceil(day_diff / 7) + " weeks ago";
                return dObj;
            }

            /* for this scope: we want month + date */
            if (day_diff < 62) {
                dObj.friendly = "a month ago";
                return dObj;
            }
            if (day_diff < 365) {
                dObj.friendly = Math.ceil(day_diff / 31) + " months ago";
                return dObj;
            }

            /* for this scope: we want month + year */
            if (day_diff >= 365 && day_diff < 730) {
                dObj.additional = date.toLocaleDateString();
                dObj.friendly = "a year ago";
                return dObj;
            }
            if (day_diff >= 365) {
                dObj.additional = date.toLocaleDateString();
                dObj.friendly = Math.ceil(day_diff / 365) + " years ago";
                return dObj;
            }
            return dObj;
        },

        name: function (name) {
            var firstName = name.split(' ')[0];
            if (firstName.indexOf('@') !== -1) {
                firstName = firstName.split('@')[0];
            }
            firstName = firstName.replace(" ", "");
            firstName = firstName.replace("'", "");
            firstName = firstName.replace('"', "");
            return firstName;
        }
    };

    return friendly;
});
