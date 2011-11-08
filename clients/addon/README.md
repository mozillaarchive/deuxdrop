# What?

Jetpack add-in that works in Firefox and Fennec.  Adds the following URL's:

- *about:dd*: Mobile deuxdrop UI.
- *about:dddev*: Deuxdrop development UI.
- *about:loggest*: Log viewer that shows what the client daemon gets up to
   with live updates as they happen.
- *about:loggest-server*: The same log viewer but tricked out to get its log
   data from the server the user is signed up with.  The server needs to be
   run with the "--loggest-web-debug" flag.  Note that in order to refresh
   this view, you need to go to "about:loggest-server" again and not just hit
   refresh.


## Requirements

Have a trunk build of the addon-sdk.


## How to build / run

* Source "bin/activate" from the addon-sdk (aka Jetpack)
* Use the "acfx" script to do what you would normally do with "cfx", except
  you will need to specify the path.  ex: "./acfx run", "./acfx xpi", etc.

