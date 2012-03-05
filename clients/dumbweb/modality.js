/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Create a moda bridge instance; assume a caller will bind it to a transport
 *  mechanism.
 **/

define(function(require) {
  var api = require('rdcommon/moda/api'),
      // we expose __moda for testing support
      bridge = document.__moda = new api.ModaBridge();

  return bridge;
});
