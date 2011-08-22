#!/bin/sh

# Creates the addon's lib/ directory contents. The path resolutions
# for packages and modules in jetpack are different than in other
# systems, and running tests does not include some packages by default.
# So, just copy everything into lib folder so it is easy for jetpack
# to find. In addition, lib-src has some adapter modules that get copied
# into lib to allow running in jetpack.
cd lib
rm -rf ./*
cd ..

cp -R lib-src/* lib/

mkdir lib/common
cp -R ../../common/* lib/common/

mkdir lib/rdcommon
cp -R ../../common/lib/rdcommon/* lib/rdcommon/

mkdir lib/rdservers
cp -R ../../servers/lib/rdservers/* lib/rdservers/
cp ../../servers/node_modules/q/q.js lib/q.js
cfx $@

