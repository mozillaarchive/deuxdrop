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

/*jslint indent: 2, strict: false */
/*global define: false */

/**
 * The data store layer.
 */

define(function (require) {
  var Q = require('Q'),
      moda, peepData;

  peepData = {
    'james@raindrop.it': {
      name: 'James',
      id: 'james@raindrop.it',
      pic: 'i/face2.png'
    },
    'bryan@raindrop.it': {
      name: 'Bryan',
      id: 'bryan@raindrop.it',
      pic: 'i/face2.png'
    },
    'andrew@raindrop.it': {
      name: 'Andrew',
      id: 'andrew@raindrop.it',
      pic: 'i/face2.png'
    }
  };

  moda = {
    peeps: function (cb) {
      cb([
        {
          name: 'James',
          id: 'james@raindrop.it'
        },
        {
          name: 'Bryan',
          id: 'bryan@raindrop.it'
        },
        {
          name: 'Andrew',
          id: 'andrew@raindrop.it'
        }
      ]);
    },

    peep: function (id, cb) {
      cb(peepData);
    }
  };

  return moda;
});




/*
Requests (email addr)
- by timer

Peeps
- by recency
- by alphabet/frecency (popularity)
- pinned

Peep Conversations
- time ordered
- pinned (per peep vs all peeps)

Conversations
- time-ordered

Messages
- body
- location

A conversation can have
- write: watermark/seen
- read: watermarks (seen) (received)

---------------

signup(email)

pin a conversation
pin a peep
update watermark for conversation
start new conversation:
  - peeps
  - message text
  - location
reply to conversation:
  - message text,
  - location
add someone(s) to conversation
  - peeps
delete a conversation
connect to a peep:
  - email
  - optional message
reject a peep
  - email
  - report(as)

-------------------

Peeps
+Compose
Pinned Peeps
Pinned Conversations

David
James

David
Hello....yesterday
hi.....today
[     ] send

conversation view
james invited roland
Show location in bubble
*/