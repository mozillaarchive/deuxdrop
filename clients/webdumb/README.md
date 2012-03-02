The dumb web interface flow goes like this:

- The user connects to the server, ex: https://us.raindrop.it/
- We do the BrowserID dance.  This results in a pop-up and login, or if they
  provided persistent auth, maybe it gets fast-pathed.
- The client establishes a (non-authconn) WebSocket channel to the server and
  crams the BrowserID auth down the channel.
- The server authenticates the BrowserID auth.  If successful, it attaches to
  an existing rawclient with a new moda bridge, or spins up a new rawclient if
  one does not exist.  The rawclient is handed a (redis) database connection
  that gets prefixed with 'u' + the e-mail address.  (TODO: Use sqlite or
  some other disky mechanism where we can also create a distinct file for the
  user.)
- If the rawclient indicates that this is a new account, we (on the server)
  just go ahead and do the signup stuff for them since we have their e-mail
  and we obviously know what server they should be using and this will avoid
  a lot of embarassing duplication.  The downside is we can't ask their name,
  but we can get that out of the BrowserID profile stuff.
- The WebSocket channel becomes the moda bridge channel on both sides of the
  connection.
- The client spins up the full mobile UI.
