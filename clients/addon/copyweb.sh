#!/bin/bash

# Copy over files needed on the addon side

# First, create a socket.io file that works in Firefox.
rm -rf lib/socket.io-client
cp -r ../node_modules/socket.io/node_modules/socket.io-client lib/

# Copy over modaTransport and its dependencies to the addon side.
# NEEDS UPDATING if the modaTransport dependencies change.
cp ../deps/modaTransport.js lib/modaTransport.js
cp ../deps/q.js lib/q.js
cp ../deps/env.js lib/env.js

# Update the modaTransport dependency to use the one in the copied
# socket.io-client directory.
sed -i '' 's:socket.io:socket.io-client/lib/io:' lib/modaTransport.js
rm -rf lib/modaTransport.jsbak

# Update any references to module.parent to be just require('io')
find lib/socket.io-client/lib/*.js -exec sed -i '' 's:module.parent.exports:require(\"./io\"):' {} \;
find lib/socket.io-client/lib/transports/*.js -exec sed -i '' 's:module.parent.exports:require(\"../io\"):' {} \;

find lib/socket.io-client/lib/*.js -exec sed -i '' 's:process.EventEmitter:require(\"./events\"):' {} \;
find lib/socket.io-client/lib/transports/*.js -exec sed -i '' 's:process.EventEmitter:require(\"../events\"):' {} \;

find lib/socket.io-client/lib/*.js -exec sed -i '' 's:__dirname:\"\":' {} \;
find lib/socket.io-client/lib/transports/*.js -exec sed -i '' 's:__dirname:\"\":' {} \;

# Clear out builder, do not need it for this use, but needs to exist
echo > lib/socket.io-client/bin/builder.js


# Copy over UI used by the content part of the addon.
rm -rf data/web
mkdir data/web
mkdir data/web/deps
mkdir data/web/firefox

cp -r ../deps data/web
cp -r ../firefox data/web
