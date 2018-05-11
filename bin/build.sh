#!/bin/bash

set -e

PATH=$PATH:./node_modules/.bin

mkdir -p build
rm -r build/* || true

mkdir build/src
browserify src/client.js --debug > build/src/client.js

mkdir build/test
browserify test/test.js --debug > build/test/test.js
