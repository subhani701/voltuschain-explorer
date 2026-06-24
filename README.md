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
   Browser  ───── 80 ──▶│   Nginx Proxy (bs-proxy) │
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
Only the proxy (`:80`) needs to be exposed publicly; everything else is internal.

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

```bash
# 1. Clone
git clone <this-repo-url> voltuschain-explorer
cd voltuschain-explorer

# 2. Create env files from the committed templates (see next section)
cd envs && for f in *.env.example; do cp "$f" "${f%.example}"; done && cd ..

# 3. Fill in secrets and RPC endpoints in envs/*.env  (see table below)

# 4. Launch
docker compose up -d

# 5. Verify
./scripts/healthcheck.sh
```

Once healthy, the explorer is available at **http://localhost** (via the proxy).

> Helper scripts `scripts/start.sh` and `scripts/stop.sh` wrap the compose
> commands for convenience.

---

## Environment Configuration

> ⚠️ **The real `envs/*.env` files are NOT committed to this repository** — they
> contain secrets (`SECRET_KEY_BASE`, API keys, DB credentials) and are excluded
> via `.gitignore`. Only `*.env.example` **templates** are tracked. Secret values
> are distributed separately (1Password / Vault / private channel) by the project
> owner.

**Create the working env files from the templates:**

```bash
cd envs
for f in *.env.example; do cp "$f" "${f%.example}"; done
cd ..
```

This produces `backend.env`, `frontend.env`, `stats.env`, `verifier.env`, and
`visualizer.env`. Replace every placeholder before starting the stack:

| Variable | File | Replace with |
|----------|------|--------------|
| `SECRET_KEY_BASE` | `backend.env` | Output of `openssl rand -hex 64` (64-byte hex) |
| `API_RATE_LIMIT_STATIC_API_KEY` | `backend.env` | The static API key (replaces `CHANGE_ME`) |
| `DATABASE_URL`, `DATABASE_READ_ONLY_API_URL` | `backend.env` | Real DB password (replaces `CHANGE_ME`) |
| `STATS__DB_URL`, `STATS__BLOCKSCOUT_DB_URL` | `stats.env` | Real DB password (replaces `CHANGE_ME`) |
| `ETHEREUM_JSONRPC_*_URL` | `backend.env` | Your Geth RPC host (replaces `YOUR_RPC_NODE_HOST`) |
| `NEXT_PUBLIC_NETWORK_RPC_URL` | `frontend.env` | Your chain's public RPC endpoint |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | `frontend.env` | WalletConnect id from https://cloud.walletconnect.com |

Also confirm chain identity in `backend.env` / `frontend.env`
(`CHAIN_ID`, `NETWORK`, `COIN`, `COIN_NAME`, `COIN_SYMBOL`).

> **Never commit a filled-in `.env` file.** The `.gitignore` already blocks
> `envs/*.env` while keeping `envs/*.env.example`.

---

## Service & Port Reference

| Service | Container | Image | Host Port | Purpose |
|---------|-----------|-------|-----------|---------|
| Proxy | `bs-proxy` | `nginx:alpine` | **80** | Public entry point (frontend + API + CORS) |
| Frontend | `bs-frontend` | `blockscout/frontend:v1.29.0` | 3000 | React web UI |
| Backend | `bs-backend` | `blockscout/blockscout:6.3.0` | 4000 | Indexer + API (`/api/v2`) |
| Database | `bs-db` | `postgres:15-alpine` | 5432 | Primary datastore |
| Redis | `bs-redis` | `redis:7-alpine` | 6379 | Cache |
| Verifier | `bs-verifier` | `smart-contract-verifier:v1.6.0` | 8150 | Contract verification |
| Visualizer | `bs-visualizer` | `visualizer:v0.2.1` | 8151 | Contract diagrams |
| Stats | `bs-stats` | `stats:v1.6.0` | 8153 | Charts & counters |
| Assets | `bs-assets` | `nginx:alpine` | _(internal)_ | Serves logos/icons |

**Public access** goes through the proxy on port **80**:

- Explorer UI — `http://localhost/`
- API v2 — `http://localhost/api/v2`

The direct service ports (3000, 4000, 5432, 6379, 8150–8153) are convenient for
debugging but **should not be exposed publicly in production** — see below.

---

## Production Hardening

This compose file ships with developer-friendly defaults. Before exposing the
explorer to the internet, apply the following:

1. **Set a strong `SECRET_KEY_BASE`** — generate with `openssl rand -hex 64`.
2. **Change the database password.** The compose file defaults to
   `POSTGRES_USER/POSTGRES_PASSWORD = blockscout/blockscout`. Override it and
   update the matching `DATABASE_URL` / `STATS__*_DB_URL` connection strings.
3. **Do not publish internal ports.** Remove (or bind to `127.0.0.1`) the host
   port mappings for `db` (5432), `redis` (6379), `backend` (4000),
   `frontend` (3000), and the microservices. Only the proxy (`80`) should be
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
curl -s http://localhost/api/v2/stats | jq
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
- Verify the API through the proxy: `curl http://localhost/api/v2/stats`
- Confirm `NEXT_PUBLIC_*` values in `frontend.env` match your deployment host
- `docker compose logs frontend`

**CORS errors in the browser**
- CORS is handled by the Nginx proxy; access the app via port **80**, not the
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
