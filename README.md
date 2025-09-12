## wrangler-kv-http (KV HTTP Emulator)

A tiny Dockerized wrapper around `wrangler dev` that exposes a Cloudflare KV-compatible HTTP API. It lets non-Worker services and multiple local Workers share the same persisted KV data during local development.

### Why

- **Share state across services**: Run local Cloudflare Workers and regular HTTP services against the same KV data.
- **KV-compatible API**: Speak to a fake Cloudflare API that mirrors the KV REST endpoints you’d use in CI or tooling.
- **Simple persistence**: Volume-mount a directory and the KV data will be persisted across runs.

### How it works

This container generates a `wrangler.toml` with your requested KV namespaces, then runs a worker with `wrangler dev`. The worker implements the Cloudflare KV REST shape and proxies the requests to the Wrangler-provided KV bindings. The idea is that you will run this and mount a volume to a shared local data directory, then run any number of other workers with `wrangler dev` and also point them at the same directory with `--persist-to`. 

---

## Quick start (Docker)

1) Build the image

```bash
docker build -t wrangler-kv-http-emulator .
```

2) Run it

```bash
mkdir -p ./kv-data

docker run --rm \
  -p 8788:8788 \
  -e NAMESPACES='[{"id":"test-namespace-1","binding":"TEST_KV_1"}]' \
  -v "~/.wrangler-kv-store:/data/wrangler-kv-store" \
  wrangler-kv-http
```

- The service listens on `http://localhost:8788`.
- Persisted KV data is stored at `/data/wrangler-kv-store` inside the container. Mount that path to keep data between runs and to share state with other local Workers.
- `NAMESPACES` is required and must be a JSON array of `{ id, binding }` entries.

Example `NAMESPACES` value:

```json
[
  { "id": "test-namespace-1", "binding": "TEST_KV_1" },
  { "id": "test-namespace-2", "binding": "TEST_KV_2" }
]
```

Notes:
- `id` is the KV namespace ID referred to in the HTTP path.
- `binding` is the Worker binding name that `wrangler dev` exposes for that namespace.

---

## HTTP API

Base path matches Cloudflare’s REST shape (the `client/v4/accounts/...` prefix is accepted but not validated):

```
http://localhost:8788/client/v4/accounts/{account_id}/storage/kv/namespaces/{namespace_id}
```

Endpoints:

- `PUT    /values/{key}`: Store value
- `GET    /values/{key}`: Retrieve value (404 if missing)
- `DELETE /values/{key}`: Delete value
- `PUT    /bulk`        : Store many values [{ key, value, (optional) expiration }]
- `DELETE /bulk`        : Delete many values ["key1", "key2", ...]
- `GET    /keys`        : List keys (supports `prefix` and `limit`)

Example usage (bash):

```bash
BASE="http://localhost:8788/client/v4/accounts/local/storage/kv/namespaces/test-namespace-1"

# Put a value
curl -X PUT "$BASE/values/my-key" --data 'hello'

# Get the value
curl "$BASE/values/my-key"

# List keys (optional prefix/limit)
curl "$BASE/keys?prefix=my-&limit=100"

# Bulk put
curl -X PUT "$BASE/bulk" \
  -H 'Content-Type: application/json' \
  -d '[{"key":"k1","value":"v1"},{"key":"k2","value":"v2"}]'

# Bulk delete
curl -X DELETE "$BASE/bulk" \
  -H 'Content-Type: application/json' \
  -d '["k1","k2"]'
```

---

## Sharing data with local Workers

Run your Workers locally with Wrangler using the same persistence directory and matching bindings/namespace IDs. Because both processes read/write the same `.wrangler-kv-store`, they’ll share data:

- This container persists to: `/data/wrangler-kv-store`
- Mount the same host directory into your Worker dev environment (e.g., Miniflare/Wrangler) to share state.

---

## Configuration

- **NAMESPACES (required)**: JSON array of objects with shape `{ id: string, binding: string }`.
- **PORT**: Currently fixed to `8788` and exposed from the container. Map it with `-p 8788:8788`.
- **Persistence path**: The container writes to `/data/wrangler-kv-store`. Mount a volume there to persist/share data.

---

## Development & Testing

Run directly (non-Docker):

```bash
npm install
NAMESPACES='[{"id":"test-namespace-1","binding":"TEST_KV_1"}]' npm run dev
```

Run tests:

```bash
npm test
```

The test setup uses `@cloudflare/vitest-pool-workers` with `wrangler.test.toml` to provide two test namespaces.

---

## Limitations (current)

- Expiration/TTL is accepted in some inputs but not enforced (values won’t expire yet).
- Metadata, base64/binary values, and advanced KV options are not implemented.
- Authentication and account validation are not implemented (intended for local dev only).
- API compatibility targets the common KV paths used for local tooling; full parity is not guaranteed.
