# Directory structure

* **addon**: used for the firefox addon.
    * **data**: used to hold the web browser window's UI files and adapter logic.
    The **deps** and **firefox** directory contents are copied into here by **copyweb.sh**.
* **deps**: the common dependencies for any client code. **common** is probably
a better name fit, but was being used for old code.
* **firefox**: the UI used for the "fake server" UI prototype for
* **server.js**: the fake server used for the content in **firefox**.
