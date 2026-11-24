#!/usr/bin/env bash
# Dump the Supabase database, encrypt it, and keep the newest $KEEP copies.
#
# Env:
#   SUPABASE_DB_URL     Postgres connection string (Supabase "Session pooler" URI)
#   BACKUP_PASSPHRASE   passphrase for symmetric AES-256 encryption (required)
#   BACKUP_DIR          where encrypted dumps are kept (default: backups)
#   KEEP                how many dumps to keep (default: 30)
#
# Output: $BACKUP_DIR/solomonquest-YYYY-MM-DDTHHMMZ.dump.gpg
# Nothing from the database is ever printed, so CI logs stay clean.
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL secret is not set}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE secret is not set}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
KEEP="${KEEP:-30}"

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y-%m-%dT%H%MZ)"
out="$BACKUP_DIR/solomonquest-$stamp.dump.gpg"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

# public = all app data; auth = user accounts (emails, password hashes);
# storage = file metadata (the files themselves live in Supabase Storage and
# are NOT in this dump). Custom format (-Fc) is compressed and restorable
# table by table with pg_restore.
pg_dump "$SUPABASE_DB_URL" \
  --format=custom \
  --no-owner --no-privileges \
  --schema=public --schema=auth --schema=storage \
  --file="$tmp"

# Sanity check: the archive must be readable and contain table data.
entries="$(pg_restore --list "$tmp" | grep -c 'TABLE DATA' || true)"
if [ "${entries:-0}" -lt 1 ]; then
  echo "Backup looks empty (no TABLE DATA entries); refusing to keep it." >&2
  exit 1
fi

gpg --batch --yes --quiet --pinentry-mode loopback \
  --passphrase "$BACKUP_PASSPHRASE" \
  --symmetric --cipher-algo AES256 \
  --output "$out" "$tmp"

size="$(du -h "$out" | cut -f1)"
echo "Backup written: $(basename "$out") ($size, $entries tables with data)"

# Retention: keep the newest $KEEP dumps.
ls -1 "$BACKUP_DIR"/solomonquest-*.dump.gpg | sort -r | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f "$old"
  echo "Removed old backup: $(basename "$old")"
done
