#!/usr/bin/env bash
# يشغّل اختبارات قاعدة البيانات على Postgres محلي مؤقت (لا يحتاج Supabase)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}"
DATA="$(mktemp -d)"
PORT=55432
cleanup() { "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT
"$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
"$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/log" start >/dev/null
sleep 1
PSQL=(psql -h /tmp -p "$PORT" -U postgres -d postgres -X -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$HERE/stub_supabase.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
# التأكد من أن الترحيل قابل لإعادة التشغيل
for f in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f "$HERE/tests.sql"
