# Directory structure

* **addon**: used for the firefox addon.
    * **data**: used to hold the web browser window's UI files and adapter logic.
    The **deps**, **mobileui**, **devui**, and **logui** directory contents are copied into here by the **acfx** script.
* **deps**: the common dependencies for any client code. **common** is probably
a better name fit, but was being used for old code.
* **mobileui**: The primary deuxdrop UI, targeted at mobile phone form factors.
* **devui**: The wmsy-based development UI.
* **logui**: The wmsy-based log UI for debugging.
* **testdrivers**: Per-client test drivers using a Selenium2 WebDriver-based API.
* **server.js**: the fake server used for the content in **firefox**.
