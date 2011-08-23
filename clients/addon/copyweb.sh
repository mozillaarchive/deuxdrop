#!/bin/bash

# Copy over UI used by the content part of the addon.
rm -rf data/web
mkdir data/web
mkdir data/web/deps
mkdir data/web/firefox

cp -r ../deps data/web
cp -r ../firefox data/web
cp -r ../../common/lib/rdcommon data/web/deps
