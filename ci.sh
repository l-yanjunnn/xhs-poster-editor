#!/usr/bin/env bash
set -e

cd app

pnpm install --ignore-workspace

./node_modules/.bin/tsc -b
./node_modules/.bin/vite build
