So, you want to hack on the styling, eh?  This is pretty simple, my friend.

Step 1: Serve the deuxdrop repository off localhost with a caching interval no
longer than 3 seconds.  For ease of use, a simple Python script is provided
that serves things on port 8887.  Run it like so:

    python webserve.py

Step 2: Browse to the styling page with the automatic reload enabled:

    http://localhost:8887/clients/mobileui/styling.html#!watch
