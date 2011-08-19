#!/bin/sh
cd lib
rm -rf ./*
cd ..
node r.js -o app.build.js
rm lib/main.js
touch lib/main.js
