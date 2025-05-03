#!/bin/bash

cd "$(dirname "$0")"

if [ ! -e "build/metis.js" -o ! -e "build/metis.wasm" ]; then
    echo "Building Metis..."
    ./script/metis.sh
else
    echo "Metis exists"
fi

if [ ! -e "build/meshoptimizer.js" -o ! -e "build/meshoptimizer.wasm" ]; then
    echo "Building Meshoptimizer..."
    ./script/meshoptimizer.sh
else
    echo "Meshoptimizer exists"
fi

echo "Building nanite..."
npm run build

if [ $? == '0' ]; then
    npm run serve
fi
