# VoltusChain Explorer

A production-ready, Docker-based [Blockscout](https://www.blockscout.com/) block
explorer for the **Voltuswave** Geth PoA (Clique) network. The stack bundles the
Blockscout backend and frontend, a smart-contract verifier, a contract
visualizer, a stats service, PostgreSQL, Redis, and an Nginx reverse proxy —
orchestrated with Docker Compose.

---

## Table of Contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Environment Configuration](#environment-configuration)
- [Service & Port Reference](#service--port-reference)
- [Production Hardening](#production-hardening)
- [Operations](#operations)
- [Health & Monitoring](#health--monitoring)
- [Troubleshooting](#troubleshooting)
- [Repository Layout](#repository-layout)
- [References](#references)

---

## Architecture

```
                        ┌──────────────────────────┐
   Browser  ──── 8091 ──▶│  Nginx Proxy (bs-proxy) │
                        └─────┬───────────────┬─────┘
                              │               │
                      ┌───────▼──────┐  ┌─────▼───────────┐
                      │  Frontend    │  │  Backend (API)  │
                      │ (bs-frontend)│  │  (bs-backend)   │
                      └──────────────┘  └───┬─────────┬───┘
                                            │         │
                    ┌───────────┬───────────┼─────────┼───────────┐
                    │           │           │         │           │
               ┌────▼───┐  ┌────▼────┐  ┌───▼───┐ ┌───▼────┐ ┌────▼─────┐
               │Postgres│  │  Redis  │  │Verifier│ │ Stats  │ │Visualizer│
               │ (bs-db)│  │(bs-redis)│ │        │ │        │ │          │
               └────────┘  └─────────┘  └────────┘ └────────┘ └──────────┘

   External dependency:  Geth PoA (Clique) RPC node  ◀── indexed by Backend
```

All containers communicate on a private bridge network (`blockscout-network`).
Only the proxy (`:8091`) needs to be exposed publicly; everything else is internal.

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Docker Engine ≥ 24 | with the Compose v2 plugin (`docker compose`) |
| A reachable Geth RPC node | HTTP + WebSocket + `debug` trace API enabled |
| CPU / RAM | ≥ 4 vCPU and ≥ 8 GB RAM recommended (indexer is memory-bound) |
| Disk | Sized for chain history; SSD strongly recommended |

The Geth node must expose:

- **HTTP RPC** — `eth_blockNumber`, `eth_getBlockByNumber`, etc.
- **Debug API** — `debug_traceTransaction` (required for internal transactions)
- **Clique API** — `clique_getSigners` (optional, for signer display)

Verify connectivity from the host before deploying:

```bash
curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  http://YOUR_RPC_NODE_HOST
```

---

## Quick Start

Everything you need to bring the explorer up from a clean checkout. Run these
from the repository root.

### 1. Clone

```bash
git clone https://github.com/subhani701/voltuschain-explorer.git
cd voltuschain-explorer
```

### 2. Create the env files from the templates

```bash
cd envs && for f in *.env.example; do cp "$f" "${f%.example}"; done && cd ..
```

This creates `backend.env`, `frontend.env`, `stats.env`, `verifier.env`, and
`visualizer.env` — the files the containers actually read.

### 3. Fill in the required values

Only a handful of placeholders must be set before the stack will run. The
commands below set everything for a working deployment (see the
[Environment Configuration](#environment-configuration) table for the full list).

```bash
# (a) Generate and insert a 64-byte secret key
SECRET=$(openssl rand -hex 64)
sed -i "s|^SECRET_KEY_BASE=.*|SECRET_KEY_BASE=$SECRET|" envs/backend.env

# (b) Point the indexer at YOUR Geth RPC node (HTTP + WS)
#     Replace the host below with your node's address.
RPC_HTTP="http://YOUR_RPC_NODE_HOST"
RPC_WS="ws://YOUR_RPC_NODE_HOST/ws"
sed -i "s|^ETHEREUM_JSONRPC_HTTP_URL=.*|ETHEREUM_JSONRPC_HTTP_URL=$RPC_HTTP|"   envs/backend.env
sed -i "s|^ETHEREUM_JSONRPC_TRACE_URL=.*|ETHEREUM_JSONRPC_TRACE_URL=$RPC_HTTP|" envs/backend.env
sed -i "s|^ETHEREUM_JSONRPC_WS_URL=.*|ETHEREUM_JSONRPC_WS_URL=$RPC_WS|"         envs/backend.env
sed -i "s|^NEXT_PUBLIC_NETWORK_RPC_URL=.*|NEXT_PUBLIC_NETWORK_RPC_URL=$RPC_HTTP|" envs/frontend.env

# (c) Set the database password. For a LOCAL trial, keep the compose default
#     `blockscout` so the templates match docker-compose.yml out of the box:
sed -i "s|:CHANGE_ME@|:blockscout@|g" envs/backend.env envs/stats.env

# (d) Set the static API key (any non-empty string is fine for a private chain)
sed -i "s|^API_RATE_LIMIT_STATIC_API_KEY=.*|API_RATE_LIMIT_STATIC_API_KEY=local-api-key|" envs/backend.env
```

> For a **production** deployment, choose a strong DB password instead of
> `blockscout` and also update `POSTGRES_PASSWORD` in `docker-compose.yml` to
> match — see [Production Hardening](#production-hardening).

WalletConnect (`NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` in `frontend.env`) is
optional — it only enables the "Connect wallet" QR flow. Leave the placeholder
if you don't need it.

### 4. Launch

```bash
docker compose up -d
```

The backend automatically creates and migrates the database on first start, then
begins indexing from `FIRST_BLOCK` (0 by default). Initial indexing can take a
while depending on chain height and RPC speed.

### 5. Verify and access

```bash
./scripts/healthcheck.sh      # checks RPC, DB, Redis, backend, frontend, verifier, stats
docker compose ps             # per-container health status
```

Once healthy, open the explorer:

| What | URL |
|------|-----|
| Explorer UI | http://localhost:8091 |
| API v2 | http://localhost:8091/api/v2 |
| Live stats | http://localhost:8091/api/v2/stats |

### 6. Stop

```bash
docker compose down           # stop (data preserved in named volumes)
docker compose down -v        # stop AND wipe all indexed data
```

> Helper scripts `scripts/start.sh` and `scripts/stop.sh` wrap these compose
> commands for convenience.

---

## Environment Configuration

The containers read their configuration from `envs/*.env`. Those files are **not
committed** (they're excluded via `.gitignore` because they hold secrets); the
repo ships `*.env.example` **templates** instead. You create the real files from
the templates and fill in the values yourself — nothing is needed from a third
party.

**Create the working env files from the templates:**

```bash
cd envs
for f in *.env.example; do cp "$f" "${f%.example}"; done
cd ..
```

This produces `backend.env`, `frontend.env`, `stats.env`, `verifier.env`, and
`visualizer.env`. The Quick Start commands above set the essential ones; the full
reference is below.

**Required** (stack will not work correctly until these are set):

| Variable | File | How to set it |
|----------|------|---------------|
| `SECRET_KEY_BASE` | `backend.env` | Generate your own: `openssl rand -hex 64` |
| `ETHEREUM_JSONRPC_HTTP_URL` / `_TRACE_URL` / `_WS_URL` | `backend.env` | Your Geth node's HTTP and WS RPC endpoints |
| `NEXT_PUBLIC_NETWORK_RPC_URL` | `frontend.env` | Same RPC endpoint, as seen by browsers |
| `DATABASE_URL`, `DATABASE_READ_ONLY_API_URL` | `backend.env` | DB password — must match `POSTGRES_PASSWORD` in `docker-compose.yml` (default `blockscout`) |
| `STATS__DB_URL`, `STATS__BLOCKSCOUT_DB_URL` | `stats.env` | Same DB password as above |
| `API_RATE_LIMIT_STATIC_API_KEY` | `backend.env` | Any value you choose (used for whitelisted API access) |

**Optional / customization:**

| Variable | File | Notes |
|----------|------|-------|
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | `frontend.env` | Free id from https://cloud.walletconnect.com — enables the wallet-connect QR flow |
| `CHAIN_ID`, `NETWORK`, `COIN`, `COIN_NAME`, `COIN_SYMBOL` | `backend.env` | Chain identity — pre-set for Voltuswave; change for your chain |
| `NEXT_PUBLIC_NETWORK_NAME`, `NEXT_PUBLIC_NETWORK_CURRENCY_*` | `frontend.env` | UI branding for chain/coin names |
| `FIRST_BLOCK` / `LAST_BLOCK` | `backend.env` | Indexing range (default: from block 0 to chain tip) |

> **Never commit a filled-in `.env` file.** The `.gitignore` already blocks
> `envs/*.env` while keeping `envs/*.env.example`.

---

## Service & Port Reference

| Service | Container | Image | Host Port | Purpose |
|---------|-----------|-------|-----------|---------|
| Proxy | `bs-proxy` | `nginx:alpine` | **8091** | Public entry point (frontend + API + CORS) |
| Frontend | `bs-frontend` | `blockscout/frontend:v1.29.0` | 3003 | React web UI |
| Backend | `bs-backend` | `blockscout/blockscout:6.3.0` | 4003 | Indexer + API (`/api/v2`) |
| Database | `bs-db` | `postgres:15-alpine` | 5433 | Primary datastore |
| Redis | `bs-redis` | `redis:7-alpine` | 6381 | Cache |
| Verifier | `bs-verifier` | `smart-contract-verifier:v1.6.0` | 8151 | Contract verification |
| Visualizer | `bs-visualizer` | `visualizer:v0.2.1` | 8153 | Contract diagrams |
| Stats | `bs-stats` | `stats:v1.6.0` | 8155 | Charts & counters |
| Assets | `bs-assets` | `nginx:alpine` | _(internal)_ | Serves logos/icons |

**Public access** goes through the proxy on port **8091**:

- Explorer UI — `http://localhost:8091/`
- API v2 — `http://localhost:8091/api/v2`

The direct service ports (3003, 4003, 5433, 6381, 8151/8153/8155) are convenient
for debugging but **should not be exposed publicly in production** — see below.

---

## Production Hardening

This compose file ships with developer-friendly defaults. Before exposing the
explorer to the internet, apply the following:

1. **Set a strong `SECRET_KEY_BASE`** — generate with `openssl rand -hex 64`.
2. **Change the database password.** The compose file defaults to
   `POSTGRES_USER/POSTGRES_PASSWORD = blockscout/blockscout`. Override it and
   update the matching `DATABASE_URL` / `STATS__*_DB_URL` connection strings.
3. **Do not publish internal ports.** Remove (or bind to `127.0.0.1`) the host
   port mappings for `db` (5433), `redis` (6381), `backend` (4003),
   `frontend` (3003), and the microservices. Only the proxy (`8091`) should be
   reachable externally.
4. **Terminate TLS.** Put the proxy behind HTTPS (e.g. a load balancer or a
   Certbot/Nginx TLS setup) and set `BLOCKSCOUT_PROTOCOL=https`,
   `API_SCHEME=https`, and the `NEXT_PUBLIC_*_PROTOCOL` values accordingly.
5. **Lock down CORS.** Set `API_V2_ALLOWED_ORIGINS` / `ALLOWED_ORIGINS` in
   `backend.env` to your real explorer domain instead of leaving them open.
6. **Pin image tags** (already done) and review them before upgrades.
7. **Back up the `postgres-data` volume** on a schedule (see Operations).
8. **Restrict the static API key** and rotate it if it is ever exposed.

> 🔐 Treat the populated `envs/*.env` files as secrets at rest. Store them with
> restricted file permissions (`chmod 600`) and back them up in a secrets
> manager, not in version control.

---

## Operations

### Start / Stop

```bash
docker compose up -d        # start (or ./scripts/start.sh)
docker compose ps           # status
docker compose down         # stop  (or ./scripts/stop.sh)
```

### Logs

```bash
docker compose logs -f                 # all services
docker compose logs -f backend         # indexer/API
docker compose logs -f backend | grep -E "block|indexed|catchup"
```

### Database Backup & Restore

```bash
# Backup
docker exec bs-db pg_dump -U blockscout blockscout \
  | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Restore (into a running, empty db)
gunzip -c backup_YYYYMMDD_HHMMSS.sql.gz \
  | docker exec -i bs-db psql -U blockscout -d blockscout
```

The `scripts/init-db.sql` file provisions the secondary `blockscout_stats`
database and grants on first boot of the `bs-db` container.

### Upgrading

1. Bump the image tag(s) in `docker-compose.yml`.
2. `docker compose pull`
3. `docker compose up -d` (the backend runs DB migrations automatically on start).
4. Verify with `./scripts/healthcheck.sh`.

### Reset (destroys all indexed data)

```bash
docker compose down -v      # removes postgres-data, redis-data, logs-data
docker compose up -d        # re-index from FIRST_BLOCK
```

---

## Health & Monitoring

Run the bundled health check (verifies RPC, DB, Redis, backend, frontend,
verifier, and stats, and prints indexing progress):

```bash
./scripts/healthcheck.sh
```

Check indexing progress directly via the API:

```bash
curl -s http://localhost:8091/api/v2/stats | jq
```

Each container also defines a Docker `healthcheck`, so `docker compose ps`
reports per-service health status.

---

## Troubleshooting

**Backend won't start**
- Confirm DB is ready: `docker exec bs-db pg_isready -U blockscout`
- Confirm RPC reachability from the host (see Prerequisites)
- `docker compose logs backend`

**Slow or stalled indexing**
- Increase `INDEXER_MEMORY_LIMIT` in `backend.env`
- Tune the `INDEXER_*_BATCH_SIZE` / `*_CONCURRENCY` values
- Check RPC node performance and `debug_traceTransaction` availability

**Frontend loads but shows no data**
- Verify the API through the proxy: `curl http://localhost:8091/api/v2/stats`
- Confirm `NEXT_PUBLIC_*` values in `frontend.env` match your deployment host
- `docker compose logs frontend`

**CORS errors in the browser**
- CORS is handled by the Nginx proxy; access the app via port **8091**, not the
  direct service ports. Check `nginx/nginx.conf` and `API_V2_ALLOWED_ORIGINS`.

---

## Repository Layout

```
voltuschain-explorer/
├── docker-compose.yml        # Stack definition (all services)
├── nginx/
│   └── nginx.conf            # Reverse proxy + CORS configuration
├── envs/
│   ├── *.env.example         # Committed templates (no secrets)
│   └── *.env                 # Real config — gitignored, provided separately
├── assets/                   # Branding: logos, icons, favicon, footer
├── scripts/
│   ├── start.sh              # Start the stack
│   ├── stop.sh               # Stop the stack
│   ├── healthcheck.sh        # End-to-end health check
│   └── init-db.sql           # Stats DB bootstrap (runs on first db boot)
└── README.md
```

---

## References

- [Blockscout Documentation](https://docs.blockscout.com/)
- [Blockscout GitHub](https://github.com/blockscout/blockscout)
- [Geth Clique (PoA) Consensus](https://geth.ethereum.org/docs/fundamentals/private-network)
