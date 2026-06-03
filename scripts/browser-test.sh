#!/bin/bash
set -e
BUNDLE=$(curl -sS https://game.navalclash.ru/ | grep -o 'app\.[^"]*\.js' | head -1)
docker run --rm --network host \
  -v /tmp/browser-test.js:/test.js:ro \
  mcr.microsoft.com/playwright:v1.49.1-jammy \
  node /test.js
