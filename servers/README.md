# Setup

## Dependencies

Your system must already have the following available:

* node.js: https://github.com/joyent/node/wiki/Installation
* npm: https://github.com/isaacs/npm

After having made sure that all of our submodules are checked out and up-to-date
(`git submodule init`, `git submodule update`), run `npm install` in this
directory and you should get everything set-up correctly.  It may take a while
to build (djb) nacl because it tries to benchmark which implementation is
fastest on your system, runs the unit tests, etc. in the process of building.
We hope to fix that one day, but until then, know that the first npm install is
a kick in the pants.

## Running stuff

Use the `cmdline` shell script to make things happen.  `./cmdline --help` should
list the commands it understands.  But as a quick overview:

* define-server: Lets you define a new server.  There is an optional positional
   argument to specify the path for the config.  If you omit it, it will assume
   you mean `serverdefs/devserver` (relative to deuxdrop/servers).  The name
   does not really matter.  Example:

    ./cmdline define-server --dns-name=us.raindrop.it --human-name="Deuxdrop US Server"  --listen-ip=0.0.0.0 --listen-port=2080 --announce-port=80

* run-server: Lets you run a server.  Same deal with the positional argument;
   if you don't provide any args, it assumes the default path.

So once you have the server defined, you can run the server this way:

    ./cmdline run-server

## Running in production

Here is some iptables magic to redirect port 80 to port 2080 so you can run
node as an unprivileged user but still expose things on port 80.

    iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 -j REDIRECT --to-port 2080

And if you want to use dumbweb (which will try to connect to itself), you will
need a rule like the following so that loopback requests also get transformed:

    iptables -t nat -I OUTPUT -p tcp -d 127.0.0.1 --dport 80 -j REDIRECT --to-ports 2080

(And it's also a good idea to check if you need to put an entry in /etc/hosts
if your public DNS resolves to an address that is not locally routable.)

# Whatsup

## Server Roles

* Maildrop: Empowered to receive messages for you.
* Mailsender: Empowered to send messages for you.
* Fanout: Does conversation stuff.

* Mailstore.  A server that stores / archives your messages.

## Server Configurations

* fullpub: Combines maildrop, mailsender, fanout, and mailstore roles.
* halfpub: Combines maildrop, mailsender, and fanout roles.
* halfpriv: Just the mailstore role.  (Could run on a client device.)
