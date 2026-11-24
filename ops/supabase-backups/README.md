# SolomonQuest: Supabase backups and keep-alive

These files go into a separate **private** GitHub repository (for example
`solomonquest-backups`). They don't belong in the public app repo: backups
hold student records, and a public repo's Action logs are public too.

| Job | When | What it does |
|---|---|---|
| `Supabase backup` | Daily, 02:41 UTC | `pg_dump` of the `public`, `auth` and `storage` schemas, encrypted with AES-256, kept on the `backups` branch (newest 30) |
| `Supabase keep-alive` | Every 6 days | Writes one timestamp so the free plan never hits its 7-day pause |

Not included: uploaded files themselves (avatars, logos, submissions). Those
live in Supabase Storage, and the dump only holds their metadata.

## One-time setup

1. **Run `supabase-keepalive.sql`** (in the app repo root) in the Supabase SQL editor.
2. **Create a private repo** on GitHub: New repository, visibility **Private**, tick "Add a README".
3. **Copy these files into it**, keeping the folders:
   - `.github/workflows/backup.yml`
   - `.github/workflows/keepalive.yml`
   - `scripts/backup.sh`
   - `README.md` (this file)

   On github.com: "Add file", then "Create new file". Type the full path, such as
   `.github/workflows/backup.yml`, paste the contents, and commit.
4. **Get the database connection string:** Supabase dashboard, **Connect**, then
   **Session pooler**, URI. It looks like
   `postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres`.
   Put your database password in place of `[YOUR-PASSWORD]`; if you don't know it,
   reset it under Project Settings, Database. Use the *Session pooler*, not
   "Direct connection": the direct one needs IPv6, which GitHub's runners
   don't have.
5. **Add two secrets** in the private repo: Settings, Secrets and variables,
   Actions, New repository secret:
   - `SUPABASE_DB_URL`: the connection string from step 4
   - `BACKUP_PASSPHRASE`: a long passphrase you invent. **Store it in your
     password manager. Without it the backups cannot be opened.**
6. **Test both:** Actions tab, choose each workflow, then **Run workflow**. Both
   should turn green, and a `backups` branch with one `.dump.gpg` file appears.

GitHub emails you if a run fails.

## Restoring

```bash
# 1. Download a file from the backups branch, then decrypt it:
gpg --decrypt solomonquest-2026-01-01T0241Z.dump.gpg > backup.dump

# 2a. See what's inside:
pg_restore --list backup.dump | less

# 2b. Restore everything into an EMPTY database (e.g. a new Supabase project):
pg_restore --no-owner --no-privileges --clean --if-exists -d "<new database URL>" backup.dump

# 2c. Or restore a single table:
pg_restore --no-owner --data-only --table=submissions -d "<database URL>" backup.dump
```

Restoring over a live database overwrites data. Restore into a new project
first, check it, then switch the app over. Restoring the `auth` schema into a
fresh Supabase project can clash with Supabase's own setup; if it does,
restore `public` first (`--schema=public`) and ask for help with accounts.

## When you move to Supabase Pro

Pro has its own daily backups. You can keep this as an extra off-site copy,
or delete the keep-alive workflow (Pro never pauses).
