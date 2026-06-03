#!/bin/bash
set -euo pipefail
HOST="${HOST:-game.navalclash.ru}"
curl -sk "https://${HOST}/" -o /tmp/index.html
echo "=== scripts in index ==="
grep -oE '/assets/[^" ]+' /tmp/index.html | sort -u | head -20
echo "=== origin vs CF (bytes downloaded) ==="
while read -r path; do
  [ -z "$path" ] && continue
  o=$(curl -sk "https://127.0.0.1${path}" -H "Host: ${HOST}" -o /tmp/o.js -w '%{size_download}')
  c=$(curl -sk "https://${HOST}${path}" -o /tmp/c.js -w '%{size_download}' 2>/dev/null || echo 0)
  echo "${path}: origin=${o} cf=${c}"
  if [ "$o" != "$c" ] && [ "$o" -gt 30000 ]; then
    echo "  TRUNCATED"
  fi
done < <(grep -oE '/assets/index-legacy[^"?]+|/assets/polyfills-legacy[^"?]+|/assets/vendor[^"?]+' /tmp/index.html | sort -u)
