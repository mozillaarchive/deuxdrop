# Directory structure

* **addon**: used for the firefox addon.
    * **data**: used to hold the web browser window's UI files and adapter logic.
    The **deps**, **mobileui**, **devui**, and **logui** directory contents are copied into here by the **acfx** script.
    data/content holds shims and bridging code.
* **deps**: the common dependencies for any client code. **common** is probably
a better name fit, but was being used for old code.
* **devui**: The wmsy-based development UI.  Not pretty!  Not a deliverable!
* **logui**: The wmsy-based log UI for debugging.
* **mobileui**: The primary deuxdrop UI, targeted at mobile phone form factors.
* **testdrivers**: Per-client test drivers using a Selenium2 WebDriver-based API.
* **server.js**: old UI prototype fake-support, being mined for gold, soon to disappear.
* **webdumb**: Infrastructure for the mobileui to be served from a website
  where the clientdaemon bits run inside the server for development expediency.
  If we end up with a web-served mobileui where the clientdaemon runs in the
  browser, that will get called websmart.
