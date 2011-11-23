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
 * Liveset viewslice adapter.
 **/

define(
  [
    'exports'
  ],
  function(
    exports
  ) {

/**
 * Make a ViewSlice that hooks up to a LiveSet.
 *
 * XXX should this automatically call close?  right now we are doing that
 *  manually... seems dumb.
 */
function LiveSetListenerViewSliceAdapter(liveSet, extraCallbacks) {
  this._listener = null;
  this.data = null;
  this.liveSet = liveSet;
  this.extraCallbacks = extraCallbacks || {};
  liveSet._listener = this;
  this.completedCount = 0;

  this.atFirst = this.atLast = true;
}
exports.LiveSetListenerViewSliceAdapter = LiveSetListenerViewSliceAdapter;
LiveSetListenerViewSliceAdapter.prototype = {
  noteRanges: function() {
  },
  grow: function() {
  },

  seek: function() {
    this._listener.didSeek(this.liveSet.items, false, this, 0);
    // send a synthetic completion notification in case we are late to the
    //  query party.
    if (this.liveSet.items.length && this.completedCount === 0)
      this.onCompleted();
  },

  translateIndex: function(index) {
    // XXX we should really be value-aware since the queries can be ordered
    return index;
  },

  unlink: function() {
    this.liveSet.destroy();
    // stop it referencing us
    // XXX the reference count bit is inconsistent with a single listener;
    //  we will likely need to address this.
    this.liveSet._listener = null;

    this._listener = null;
    this.extraCallbacks = {};
    this.data = null;
  },

  onSplice: function(index, howMany, addedItems, liveSet) {
    if (!this._listener)
      return;
    this._listener.didSplice(index, howMany, addedItems, true, false, this);

    if (addedItems.length) {
      if (this.extraCallbacks.hasOwnProperty("newItemAdded"))
        this.extraCallbacks.newItemAdded();
    }
  },

  onCompleted: function() {
    // no need to do anything, the splice logic covers everything
    if ((this.completedCount++ === 0) &&
        this.extraCallbacks.hasOwnProperty("initialCompletion")) {
      this.extraCallbacks.initialCompletion();
    }
  },
};

}); // end define
