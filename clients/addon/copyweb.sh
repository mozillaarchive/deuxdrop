#!/bin/bash

# Copy over files needed on the addon side

# First, fetch socket.io file from the fake server.
wget http://127.0.0.1:8888/socket.io/socket.io.js
mv socket.io.js lib/socket.io.js

# Copy over modaTransport and its dependencies to the addon side.
# NEEDS UPDATING if the modaTransport dependencies change.
cp ../deps/modaTransport.js lib/modaTransport.js
cp ../deps/q.js lib/q.js
cp ../deps/env.js lib/env.js

# Copy over UI used by the content part of the addon.
rm -rf data/web
mkdir data/web
mkdir data/web/deps
mkdir data/web/firefox

cp -r ../deps data/web/deps
cp -r ../firefox data/web/firefox
