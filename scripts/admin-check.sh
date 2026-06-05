#!/bin/bash
set -euo pipefail
cd /opt/naval-clash
echo "=== ENV ==="
grep -E '^(ADMIN_API_KEY|ADMIN_PANEL_IPS|ADMIN_TELEGRAM|ADMIN_ALERT)' .env | sed 's/ADMIN_API_KEY=.*/ADMIN_API_KEY=***masked***/'

KEY=$(grep '^ADMIN_API_KEY=' .env | cut -d= -f2-)
HOST='176-12-68-39.sslip.io'

PANEL_PATH=$(grep '^ADMIN_PANEL_PATH=' .env 2>/dev/null | cut -d= -f2- || echo 'harbor-9k2-mnx-panel')
echo "=== old /admin.html (expect 404) ==="
curl -sk -o /dev/null -w "%{http_code}\n" "https://127.0.0.1/admin.html" -H "Host: $HOST"
echo "=== panel gate $PANEL_PATH (expect 200 login page) ==="
curl -sk -o /dev/null -w "%{http_code}\n" "https://127.0.0.1/${PANEL_PATH}" -H "Host: $HOST"

echo "=== API without key ==="
curl -sk -o /dev/null -w "stats: %{http_code}\n" "https://127.0.0.1/api/admin/stats" -H "Host: $HOST"

echo "=== API with key ==="
curl -sk "https://127.0.0.1/api/admin/stats" -H "Host: $HOST" -H "x-admin-key: $KEY" | head -c 500
echo

echo "=== activity ==="
curl -sk "https://127.0.0.1/api/admin/activity" -H "Host: $HOST" -H "x-admin-key: $KEY" | head -c 300
echo

echo "=== alerts status ==="
curl -sk "https://127.0.0.1/api/admin/alerts" -H "Host: $HOST" -H "x-admin-key: $KEY"
echo

echo "=== users count ==="
curl -sk "https://127.0.0.1/api/admin/users" -H "Host: $HOST" -H "x-admin-key: $KEY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('users:', len(d))"

echo "=== withdrawals pending ==="
curl -sk "https://127.0.0.1/api/admin/withdrawals?status=PENDING" -H "Host: $HOST" -H "x-admin-key: $KEY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('pending:', len(d))"
