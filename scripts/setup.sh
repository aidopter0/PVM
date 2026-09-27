#!/usr/bin/env bash
# One-time developer setup: checks Node, creates .env, starts Postgres, creates
# the database, runs migrations and loads demo data.
#
#   npm run setup              # or: bash scripts/setup.sh
#   npm run setup -- --no-demo # skip the demo data
#
# Postgres comes from, in order: an already reachable DATABASE_URL, Docker
# (docker compose service "db"), or a local Postgres install (Debian/Ubuntu
# packages or Homebrew).
set -euo pipefail
cd "$(dirname "$0")/.."

DEMO=1
for arg in "$@"; do
  case "$arg" in
    --no-demo) DEMO=0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

# --- Node --------------------------------------------------------------------
step "Checking Node.js"
command -v node >/dev/null || fail "Node.js 22 or newer is required. Install it from https://nodejs.org/en/download and re-run."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 22 ] || fail "Node.js $(node -v) found; version 22 or newer is required (https://nodejs.org/en/download)."
echo "Node $(node -v)"

# --- .env --------------------------------------------------------------------
step "Preparing .env"
if [ -f .env ]; then
  echo ".env already exists; leaving it unchanged"
else
  PW=$(node -e 'console.log(require("crypto").randomBytes(18).toString("base64url"))')
  sed -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$PW/" \
      -e "s#^DATABASE_URL=.*#DATABASE_URL=postgresql://pvm:$PW@localhost:5432/pvm#" \
      .env.example > .env
  echo "Created .env with a generated database password"
fi
set -a
# shellcheck disable=SC1091
. ./.env
set +a
: "${DATABASE_URL:?DATABASE_URL must be set in .env}"

# --- Dependencies ------------------------------------------------------------
step "Installing npm dependencies"
npm install --no-fund --no-audit

# --- Postgres ----------------------------------------------------------------
db_ready() {
  node -e '
    const c = new (require("pg").Client)({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
    c.connect().then(() => c.end()).then(() => process.exit(0), () => process.exit(1));
  ' 2>/dev/null
}

wait_for_db() {
  for _ in $(seq 1 30); do
    db_ready && return 0
    sleep 2
  done
  return 1
}

# Parse the connection string once so the local-install path creates the matching role/database.
IFS=$'\t' read -r DB_HOST DB_PORT DB_USER DB_PASS DB_NAME < <(node -e '
  const u = new URL(process.env.DATABASE_URL);
  const d = decodeURIComponent;
  console.log([u.hostname, u.port || "5432", d(u.username), d(u.password), d(u.pathname.slice(1))].join("\t"));
')
URL_PORT=$DB_PORT

# Runs psql as a Postgres superuser on the local server.
psql_super() {
  if [ "$(id -u)" = 0 ] && id postgres >/dev/null 2>&1; then
    su postgres -c "psql -p $DB_PORT -v ON_ERROR_STOP=1 $*"
  elif id postgres >/dev/null 2>&1 && command -v sudo >/dev/null; then
    sudo -u postgres psql -p "$DB_PORT" -v ON_ERROR_STOP=1 "$@"
  else
    # Homebrew: the installing user is the superuser.
    psql -h localhost -p "$DB_PORT" -d postgres -v ON_ERROR_STOP=1 "$@"
  fi
}

create_role_and_db() {
  local sql pass=${DB_PASS//\'/\'\'}
  sql=$(cat <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE ROLE "$DB_USER" LOGIN PASSWORD '$pass';
  ELSE
    ALTER ROLE "$DB_USER" LOGIN PASSWORD '$pass';
  END IF;
END \$\$;
SELECT 'CREATE DATABASE "$DB_NAME" OWNER "$DB_USER"' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec
SQL
)
  printf '%s\n' "$sql" | psql_super -q
}

start_local_postgres() {
  if command -v pg_lsclusters >/dev/null; then
    # Debian/Ubuntu: start the first cluster, creating one if none exists.
    if [ -z "$(pg_lsclusters -h)" ]; then
      local ver
      ver=$(ls /usr/lib/postgresql | sort -V | tail -1)
      pg_createcluster "$ver" main --start
    fi
    read -r ver name port _ <<<"$(pg_lsclusters -h | head -1)"
    DB_PORT=$port
    pg_ctlcluster "$ver" "$name" start 2>/dev/null || sudo pg_ctlcluster "$ver" "$name" start 2>/dev/null || true
    return 0
  fi
  if command -v brew >/dev/null && brew list --formula | grep -q '^postgresql'; then
    brew services start "$(brew list --formula | grep '^postgresql' | sort -V | tail -1)"
    return 0
  fi
  return 1
}

step "Connecting to Postgres"
if db_ready; then
  echo "Database at $DB_HOST:$DB_PORT is reachable"
elif command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  echo "Starting Postgres with Docker (docker compose service \"db\")"
  docker compose up -d db
  wait_for_db || fail "Postgres in Docker did not become ready. Check: docker compose logs db"
elif [ "$DB_HOST" = localhost ] || [ "$DB_HOST" = 127.0.0.1 ]; then
  if start_local_postgres; then
    echo "Using the local Postgres install on port $DB_PORT"
    [ "$DB_PORT" = "$URL_PORT" ] ||
      fail "Local Postgres runs on port $DB_PORT but DATABASE_URL uses another port. Update DATABASE_URL in .env and re-run."
    sleep 2
    create_role_and_db
    wait_for_db || fail "Could not connect with DATABASE_URL after creating the database. Check the credentials in .env."
  else
    fail "No Postgres found. Either:
  - install and start Docker, then re-run this script (it will start Postgres for you), or
  - install PostgreSQL 14+ (https://www.postgresql.org/download/) and re-run, or
  - point DATABASE_URL in .env at an existing Postgres database and re-run."
  fi
else
  fail "Cannot reach $DB_HOST:$DB_PORT. Check DATABASE_URL in .env."
fi
echo "Postgres is ready"

# --- Schema and data ---------------------------------------------------------
step "Running database migrations"
npm run --silent db:migrate

if [ "$DEMO" = 1 ]; then
  step "Loading demo data"
  npm run --silent db:seed
fi

step "Done"
echo "Start the app with:  npm start      (then open http://localhost:${API_PORT:-3000})"
echo "Or for development:  npm run dev    (then open http://localhost:5173)"
