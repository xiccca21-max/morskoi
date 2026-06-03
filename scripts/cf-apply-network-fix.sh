#!/bin/bash
# Применяет фиксы из Cloudflare Community #701862, posthog-js#1906, turbowarp.
# Нужно в .env: CLOUDFLARE_API_TOKEN (Zone Settings Edit + Rules Write), CLOUDFLARE_ZONE_ID (опционально — ищем по navalclash.ru)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$ROOT/.env" ]; then
  # shellcheck disable=SC1090
  source "$ROOT/.env"
fi

TOKEN="${CLOUDFLARE_API_TOKEN:-}"
ZONE="${CLOUDFLARE_ZONE_ID:-}"
DOMAIN="${CLOUDFLARE_ZONE_NAME:-navalclash.ru}"

if [ -z "$TOKEN" ]; then
  echo "CLOUDFLARE_API_TOKEN не задан. Создай токен: Zone > Zone Settings Edit + Zone > Rules Write"
  echo "Положи в $ROOT/.env и запусти снова."
  exit 1
fi

API="https://api.cloudflare.com/client/v4"
auth=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")

if [ -z "$ZONE" ]; then
  ZONE=$(curl -s "${API}/zones?name=${DOMAIN}" "${auth[@]}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result'][0]['id'] if d.get('result') else '')")
fi
[ -n "$ZONE" ] || { echo "Zone not found for $DOMAIN"; exit 1; }
echo "Zone ID: $ZONE"

# 1) HTTP/3 (QUIC) off — TG Android + CF truncation reports
curl -s -X PATCH "${API}/zones/${ZONE}/settings/http3" "${auth[@]}" \
  --data '{"value":"off"}' | python3 -c "import sys,json; r=json.load(sys.stdin); print('http3:', r.get('success'), r.get('errors'))"

# 2) 0-RTT off (связано с QUIC)
curl -s -X PATCH "${API}/zones/${ZONE}/settings/0rtt" "${auth[@]}" \
  --data '{"value":"off"}' | python3 -c "import sys,json; r=json.load(sys.stdin); print('0rtt:', r.get('success'))"

# 3) Replace insecure JS libraries off (Free plan default on)
curl -s -X PATCH "${API}/zones/${ZONE}/settings/replace_insecure_js" "${auth[@]}" \
  --data '{"value":"off"}' | python3 -c "import sys,json; r=json.load(sys.stdin); print('replace_insecure_js:', r.get('success'))"

# 4) TLS 1.3 off — Stack Overflow / TG WebView + CF
curl -s -X PATCH "${API}/zones/${ZONE}/settings/tls_1_3" "${auth[@]}" \
  --data '{"value":"off"}' | python3 -c "import sys,json; r=json.load(sys.stdin); print('tls_1_3:', r.get('success'))"

# 5) Brotli at edge off — posthog-js#1906 mismatch
curl -s -X PATCH "${API}/zones/${ZONE}/settings/brotli" "${auth[@]}" \
  --data '{"value":"off"}' | python3 -c "import sys,json; r=json.load(sys.stdin); print('brotli:', r.get('success'))"

# 6) Compression rules: zone-wide gzip+brotli ONLY (no zstd) — CF staff #701862
PHASE="http_response_compression"
RULESET=$(curl -s "${API}/zones/${ZONE}/rulesets/phases/${PHASE}/entrypoint" "${auth[@]}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('result') or {}).get('id',''))")

RULE_JSON='{
  "rules": [
    {
      "description": "NavalClash: no zstd (truncation fix #701862)",
      "expression": "true",
      "action": "compress_response",
      "action_parameters": {
        "algorithms": [
          {"name": "brotli"},
          {"name": "gzip"}
        ]
      }
    }
  ]
}'

if [ -n "$RULESET" ]; then
  curl -s -X PUT "${API}/zones/${ZONE}/rulesets/${RULESET}" "${auth[@]}" --data "$RULE_JSON" \
    | python3 -c "import sys,json; r=json.load(sys.stdin); print('compression ruleset:', r.get('success'), r.get('errors'))"
else
  curl -s -X POST "${API}/zones/${ZONE}/rulesets" "${auth[@]}" \
    --data "{\"name\":\"compression\",\"kind\":\"zone\",\"phase\":\"${PHASE}\",\"rules\":$(echo "$RULE_JSON" | python3 -c 'import sys,json; print(json.dumps(json.load(sys.stdin)["rules"]))')}" \
    | python3 -c "import sys,json; r=json.load(sys.stdin); print('compression create:', r.get('success'), r.get('errors'))"
fi

# 7) Page Rule: bypass cache for assets (classic API still works)
curl -s -X POST "${API}/zones/${ZONE}/pagerules" "${auth[@]}" --data '{
  "targets": [{"target": "url", "constraint": {"operator": "matches", "value": "game.navalclash.ru/assets/*"}}],
  "actions": [{"id": "cache_level", "value": "bypass"}],
  "priority": 1,
  "status": "active"
}' | python3 -c "import sys,json; r=json.load(sys.stdin); print('page rule:', r.get('success'), r.get('errors'))"

# 8) Purge everything
curl -s -X POST "${API}/zones/${ZONE}/purge_cache" "${auth[@]}" --data '{"purge_everything":true}' \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print('purge:', r.get('success'))"

# 9) Grey cloud на game — turbowarp / #701862 «disabled CDN»
REC=$(curl -s "${API}/zones/${ZONE}/dns_records?name=game.navalclash.ru" "${auth[@]}" \
  | python3 -c "import sys,json; r=json.load(sys.stdin).get('result') or []; print(r[0]['id'] if r else '')")
if [ -n "$REC" ]; then
  curl -s -X PATCH "${API}/zones/${ZONE}/dns_records/${REC}" "${auth[@]}" --data '{"proxied":false}' \
    | python3 -c "import sys,json; r=json.load(sys.stdin); print('grey cloud game:', r.get('success'))"
fi

echo "Done. Run scripts/cf-asset-check.sh to verify."
