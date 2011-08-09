An add-on that runs in Mobile Firefox for deuxdrop. The addon hosts the UI
from within the extension, and uses a separate worker for the data pipe to
the server.

## Modifications to Add-On SDK

Updates to get it to run:

Update the addon-sdk-1.0/python-lib/cuddlefish/app-extension/install.rdf to
include the targetApplication for mobile firefox:

    <em:targetApplication>
      <!-- Fennec -->
      <Description>
        <em:id>{a23983c0-fd0e-11dc-95ff-0800200c9a66}</em:id>
        <em:minVersion>4.0b5</em:minVersion>
        <em:maxVersion>7.0.*</em:maxVersion>
      </Description>
    </em:targetApplication>

In these two files:

* packages/api-utils/lib/hidden-frame.js
* packages/addon-kit/lib/page-worker.js

comment out this check:

    if (!require("xul-app").isOneOf(["Firefox", "Thunderbird"])) {
      throw new Error([
        "The hidden-frame module currently supports only Firefox and Thunderbird. ",
        "In the future, we would like it to support other applications, however. ",
        "Please see https://bugzilla.mozilla.org/show_bug.cgi?id=546740 for more ",
        "information."
      ].join(""));
    }

This will allow the extension to work on mobile Firefox.

## How to build

* ./copyweb.sh
* cfx xpi

The copyweb.sh takes the UI that can be served from a web server and includes
it in the add-on.