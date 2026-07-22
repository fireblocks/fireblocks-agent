# Fireblocks Key Link — Customer Server Cluster Mode Setup Guide

**Audience:** Customers evaluating Fireblocks Key Link with the example (SoftHSM-based) customer server, running workloads that need higher signing throughput.

**Applies to:** Fireblocks Agent v2.2.9+ / example customer server with `docker-compose.cluster.yml`.

> ⚠️ **Evaluation use only.** The example customer server uses SoftHSM (a software HSM emulator) and an unauthenticated MongoDB instance. It is intended for proof-of-concept and evaluation environments only — **do not use it to protect production key material**. For production, integrate your own customer server with a certified HSM.

---

## 1. What is cluster mode?

Cluster mode (`docker-compose.cluster.yml`) runs the example customer server as a **pool of signing processes in parallel** behind an nginx load balancer, so signing throughput scales with the CPU cores of the host. It is the recommended setup when your evaluation involves signing many requests in parallel. (A simpler single-process setup, `docker-compose.yml`, also exists and is sufficient for a minimal functional test; both modes are interchangeable — see below.)

### Architecture

```
Fireblocks Agent
       |
       v
 nginx (host port 5000 — the only published entry point)
       |
       |-- /api/hsm/*  -->  customer-server-primary  (1 process:  key generation)
       |
       '-- /api/*      -->  customer-server-signer   (N processes: signing pool)
                                    |
                 shared SoftHSM token volumes + shared MongoDB
```

**How requests are routed:** signing traffic (`/api/messagesToSign`, `/api/messagesStatus`, `/api/signRequest/...`) is load-balanced round-robin across the `customer-server-signer` replicas, while key generation (`/api/hsm/*`) always goes to the single `customer-server-primary` process. Keeping key generation on one process is what makes the shared token safe for parallel signing; nginx enforces this routing automatically, so no extra configuration is needed.

**Agent configuration:** the Fireblocks Agent needs no cluster-specific settings. nginx is its single entry point on host port 5000, so `CUSTOMER_SERVER_URL` is simply `http://<host>:5000/api` — identical in both modes. Keys, tokens, and the message database live on shared Docker volumes, so you can switch between cluster and single-process mode at any time without losing keys.

---

## 2. Prerequisites

- A single Linux/macOS host with Docker Engine and the Docker Compose v2 plugin (`docker compose`, not the legacy `docker-compose`).
- Node.js 18+ and npm on the host (used for the build scripts).
- The Fireblocks Agent repository cloned, with the example server at `examples/server`.
- CPU: the more cores, the more signer replicas you can run effectively (see [Choosing N](#choosing-the-number-of-signer-replicas-n)).
- Port **5000** must be available on the host (no other service listening on it).

---

## 3. Setup steps

All commands run from `examples/server` unless noted.

### Step 1 — Build the image (one-time)

```bash
cd examples/server
npm run build:docker      # generates the API types and builds the softhsm2:2.6.1 image
```

### Step 2 — Create the shared Docker volumes (one-time)

```bash
npm run docker:volumes    # creates the shared volumes (database, softhsm, tokens)
```

These volumes hold the SoftHSM token (your keys) and the message database. They are shared with the single-process setup, so keys and messages carry over if you ever switch modes.

> If you have previously run the single-process setup (`npm run start:docker`), both steps above are already done — skip to Step 3.

### Step 3 — Make sure the single-process setup is not running

On a fresh host, skip this step. Both compose files publish host port 5000, so **run one mode at a time, never both**:

```bash
docker compose down       # stops the single-process setup; volumes are preserved
```

### Step 4 — Start cluster mode

```bash
# start with N signer replicas (example: N=4)
docker compose -f docker-compose.cluster.yml up -d --scale customer-server-signer=4
```

If you omit `--scale`, the default of 2 signer replicas is used.

### Step 5 — Verify

```bash
docker compose -f docker-compose.cluster.yml ps
```

You should see: `nginx`, `customer-server-primary`, N × `customer-server-signer`, and `customer-database` — all `Up`.

Check the nginx entry point:

```bash
curl http://localhost:5000/healthz     # expected: ok
```

### Step 6 — Generate keys, then restart the signer pool

> ⚠️ **Generate keys BEFORE you start signing.** Signer replicas load the token contents at startup — a key generated after a signer started is not visible to that signer until it restarts, which shows up as intermittent "key not found" signing failures.

Generate and register your signing keys as usual (key-generation requests are routed through nginx to the primary automatically), then restart the signer pool so all replicas pick up the new keys:

```bash
docker compose -f docker-compose.cluster.yml restart customer-server-signer
```

Repeat this restart any time you generate additional keys later.

### Step 7 — Point the Fireblocks Agent at the server

In the Agent's env file (e.g. `.env.prod`):

```
CUSTOMER_SERVER_URL="http://<host>:5000/api"
```

Then start the Agent as usual.

### Stopping cluster mode

```bash
docker compose -f docker-compose.cluster.yml down    # volumes (keys, DB) are preserved
```

---

## 4. Choosing the number of signer replicas (N)

Start with **N = number of CPU cores** on the host (each signer replica makes good use of about one core under signing load), then adjust based on measurement of your actual signing throughput.

To resize a running cluster:

```bash
docker compose -f docker-compose.cluster.yml up -d --scale customer-server-signer=<N>
```

nginx re-resolves the signer pool via Docker DNS every few seconds, so replicas added by `--scale` are picked up automatically without restarting nginx.

---

## 5. Operational rules (please read carefully)

1. **Run one mode at a time.** `docker-compose.yml` and `docker-compose.cluster.yml` both publish host port 5000 and share the same volumes. Stop one before starting the other.

2. **Generate keys BEFORE scaling signers.** Each signer loads the token contents when it starts. Keys generated afterwards (via the primary) are **not visible to already-running signers** until they are restarted:

   ```bash
   docker compose -f docker-compose.cluster.yml restart customer-server-signer
   ```

   This is Step 6 of the setup flow: start the cluster → generate/register your keys → restart the signer pool → begin signing.

3. **Key generation stays single-process.** Never generate keys concurrently from multiple processes against the same SoftHSM token. nginx enforces this by routing all of `/api/hsm/` to `customer-server-primary` only — do not bypass nginx to reach backends directly.

4. **The shared token is safe for concurrent signing only.** Do not run any other writer (key generation, key deletion, token re-initialization) while signers are actively signing.

5. **Single host only.** Do not share a SoftHSM token volume across machines — the file-backed object store is not a networked HSM. To scale beyond one host, give each host its own token (its own keys), or use a real network HSM.

6. **The database is internal-only.** MongoDB is reachable only from inside the compose network — no host port is published, by design. The customer-server containers reach it via Docker DNS; nothing outside the host needs to.

---

## 6. TLS (optional)

By default, cluster mode runs plain HTTP on port 5000. In cluster mode, TLS is terminated **by nginx** — the customer-server replicas always speak plain HTTP on the internal Docker network and are never exposed on the host.

To enable TLS with a self-signed certificate:

1. Create `env/priv-key.txt` and `env/self-signed-cert.txt` following the [Support for self signed certificate](../examples/server/README.md#support-for-self-signed-certificate) section of the example server's README (the certificate-creation steps only — skip the `SELF_SIGNED_SSL_*` server variables; those apply to single-process mode and are deliberately forced empty in cluster mode).
2. In `docker-compose.cluster.yml`, uncomment the two cert/key volume mounts on the `nginx` service.
3. In `nginx.conf`, comment out `listen 5000;` and uncomment the `listen 5000 ssl;` block (`ssl_certificate` + `ssl_certificate_key`).
4. Recreate nginx:

   ```bash
   docker compose -f docker-compose.cluster.yml up -d --force-recreate nginx
   ```

5. In the Agent env file, change `CUSTOMER_SERVER_URL` to `https://<host>:5000/api` and set `SSL_CERT_PATH` to the self-signed certificate so the Agent trusts it:

   ```
   SSL_CERT_PATH="./examples/server/env/self-signed-cert.txt"
   ```

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `port is already allocated` on startup | Single-process mode (or another cluster instance) is still running | Run `docker compose down` for single-process mode, or `docker compose -f docker-compose.cluster.yml down` for cluster mode |
| Signing fails with "key not found" on some requests only | Signers started before the keys were generated | `docker compose -f docker-compose.cluster.yml restart customer-server-signer` |
| `curl http://localhost:5000/healthz` fails | nginx not up, or port conflict | `docker compose -f docker-compose.cluster.yml ps` and check nginx logs: `docker compose -f docker-compose.cluster.yml logs nginx` |
| Throughput doesn't improve with more replicas | Host is out of CPU cores, or load is not signing-bound | Check `docker stats`; keep N ≤ physical cores |
| Agent gets TLS errors after enabling SSL | Agent doesn't trust the self-signed certificate | Set `SSL_CERT_PATH` in the Agent env file (Section 6, step 5) |

---

## Security Considerations

- **SoftHSM is for evaluation.** It lets you run the full flow without HSM hardware; production deployments use a certified HSM together with your own customer-server implementation.
- **Keep the example database internal.** Cluster mode keeps MongoDB on the internal Docker network by design (no published host port) — leave it that way and do not add a port mapping to it.
- **Do not expose port 5000 to untrusted networks.** Restrict access to the host so only the Fireblocks Agent can reach it, and prefer enabling TLS (Section 6).
- **Backend containers must stay unpublished.** Only nginx should be reachable; bypassing it can route key-generation writes to signer replicas and corrupt the shared token.

### From evaluation to production

The example server is a **reference implementation**: in production you implement the customer-server API on your own infrastructure, so every component here, including the datastore, is your choice. A typical production deployment keeps the same architecture and runs the datastore on your standard database platform with your standard controls: authentication with least-privilege roles, credentials from a secrets manager, TLS in transit, encryption at rest, private network placement, high availability, and backups. The design's requirements on the datastore are minimal: durable storage of request state, including the `requestId` record used to treat repeated requests idempotently. Key material is stored only in the HSM.

For production reference architectures, or questions about this guide, contact your Fireblocks representative.
