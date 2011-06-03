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
list the commands it understands.

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
