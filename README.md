# Deuxdrop

Raindrop 2 => Raindrop Deux => Deuxdrop

A messaging system being grown from the kernel of an android client (phonegap)
with a server (node.js w/hbase).

## Checking It Out

    git clone --recursive git://github.com/asutherland/deuxdrop.git

## Directories

Implementation:

- clients: Clients and client-specific JS code
- common: JS code shared between client, server
- servers: Servers and server-specific JS code

UI/UX:

- design: Mockups

Server Deployment:

- deploy: cobbler/puppet automation for setting up servers / dev machines

## Building

* Make sure you checked us out with "git clone --recursive".  If not, do
   "git submodule init".
* Make sure deps are up to date via "git submodule update"
* cd servers; npm install
