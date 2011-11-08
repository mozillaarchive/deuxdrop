These are Jetpack/Add-On SDK tests.  They are intended to be invoked manually
as one-off executions (using "-f" to filter to just one test).  This is because
some require manual setup; for example, "test-authconn-echoserver.js" requires
node to be running an echo server in order to test that our Firefox WebSockets
and node WebSockets functionality interoperates as well as our nacl shims and
the authconn abstraction built on top of all of that stuff.
