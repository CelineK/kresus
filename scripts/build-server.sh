#!/bin/bash

# Default to development
if [ -z "$NODE_ENV" ]
then
    NODE_ENV="development"
fi
echo "Building in $NODE_ENV mode..."

rm -rf ./build/server

echo "Copying shared files..."
mkdir -p ./build/server/shared
cp -r ./shared/*.json ./build/server/shared

echo "Copying locale files..."
mkdir -p ./build/server/shared/locales
cp -r ./shared/locales/*.json ./build/server/shared/locales

echo "Building server JS..."
mkdir -p ./build/server
./node_modules/babel-cli/bin/babel.js \
    --presets env,stage-0 \
    ./server/ \
    -d ./build/server

echo "Copying Weboob endpoint..."
mkdir -p ./build/server/weboob
cp ./server/weboob/main.py ./build/server/weboob/ && chmod +x ./build/server/weboob/main.py

echo "Done!"
