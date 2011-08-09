# Deuxdrop

Secure messaging with the distributed federation and deliver model of email but with the contact list model of chat systems like jabber.

_Raindrop 2 => Raindrop Deux => Deuxdrop_

## Checking it out

_note the `--recursive` option_

    git clone --recursive git://github.com/mozilla/deuxdrop.git

## Directory structure

* [clients/](https://github.com/mozilla/deuxdrop/tree/develop/clients): Clients and client-specific JS code
* [common/](https://github.com/mozilla/deuxdrop/tree/develop/common): JS code shared between client, server
* [deploy/](https://github.com/mozilla/deuxdrop/tree/develop/deploy): cobbler/puppet automation for setting up servers / dev machines
* [servers/](https://github.com/mozilla/deuxdrop/tree/develop/servers): Servers and server-specific JS code

## System deps

See the [install instructsions](https://github.com/mozilla/deuxdrop/wiki/Install-Instructions) for help

* [redis](http://redis.io/) _currently for the prototype_
* [node.js](https://github.com/joyent/node)
* [npm](https://github.com/isaacs/npm)

## Building

_note: make sure you checked us out with `git clone --recursive`.  If not, do
   `git submodule init` and then `git submodule update`_

    cd servers

**waf** is needed for building the [nacl](https://github.com/asutherland/nacl) library

    wget http://waf.googlecode.com/files/waf-1.6.6 && mv waf-1.6.6 node_modules/nacl/nacl/waf && chmod 755 node_modules/nacl/nacl/waf

_note: make sure you have [npm](https://github.com/isaacs/npm) and [node.js](https://github.com/joyent/node) installed, see [instructsions](https://github.com/mozilla/deuxdrop/wiki/Install-Instructions)_

    npm install

Problems installing?  Checkout our [Build FAQ](https://github.com/mozilla/deuxdrop/wiki/Install-Instructions)

## Running

The `cmdline` tool will help you get things running.  Use `./cmdline --help` for more.

    ./cmdline run-server

## Docs

See the [deuxdrop wiki](https://github.com/mozilla/deuxdrop/wiki) for more documentation
