#!/bin/bash
curl -sS https://game.navalclash.ru/ > /tmp/live.html
grep -E 'script|stylesheet' /tmp/live.html | head -8
echo "---"
grep -c crossorigin /tmp/live.html || echo "no crossorigin"
grep -c 'type="module"' /tmp/live.html || echo "no module"
