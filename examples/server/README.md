# Customer server example
This server implement an example integration with HSM module assuming SoftHSM.
- Hardcoded PIN used in the example is "1234"
- The example uses first available slot which is usually slot 0
- Current example supports ECDSA secp256k1 and EdDSA Ed25519 curves

# Running (single process, default)
This is the standard setup, also described in the [main README](../../README.md#running).
It runs ONE customer-server container (plus MongoDB), defined in `docker-compose.yml`:
```bash
npm run build:docker    # generate the API types and build the softhsm2:2.6.1 image
npm run start:docker    # create the shared docker volumes and start docker-compose.yml
```
The server listens on host port 5000 (`http://<host>:5000/api`).

# Running in cluster mode (optional)
The default single-process setup signs serially: one customer-server process holds a
single PKCS#11 session, and the synchronous `pkcs11js` native calls block Node's one
event loop. Under sustained signing load, throughput is therefore capped at roughly one
CPU core, no matter how many cores the host has.

Cluster mode is an OPT-IN alternative, defined in `docker-compose.cluster.yml`, that
scales SoftHSM signing across CPU cores on a single host. The default single-process
behavior is unchanged — you explicitly run the cluster compose file instead:

```
Fireblocks Agent
       |
       v
 nginx (host port 5000, the only published entry point)
       |
       |-- /api/hsm/*  -->  customer-server-primary  (1 process:  key generation)
       |
       '-- /api/*      -->  customer-server-signer   (N processes: signing pool)
                                    |
                 shared SoftHSM token volumes + shared MongoDB
```

Why this is safe: SoftHSM's file-backed token supports CONCURRENT SIGNING from multiple
processes, because signing only reads the token. KEY GENERATION writes to the token, so
nginx pins it (`/api/hsm/`, i.e. `generateKeyPair`) to the single
`customer-server-primary` process, while signing traffic (`/api/messagesToSign`,
`/api/messagesStatus`, `/api/signRequest/...`) is load-balanced round-robin across the
`customer-server-signer` replicas.

## How to run
```bash
# one-time, same as single-process mode (skip if already done):
npm run build:docker      # generate the API types and build the softhsm2:2.6.1 image
npm run docker:volumes    # create the shared docker volumes

# start cluster mode with N signer replicas (example: N=4):
docker compose -f docker-compose.cluster.yml up -d --scale customer-server-signer=4

# watch it:
docker compose -f docker-compose.cluster.yml ps

# stop it:
docker compose -f docker-compose.cluster.yml down
```

The Fireblocks Agent configuration does not change: nginx publishes the same host
port 5000 as the single-process setup, so `CUSTOMER_SERVER_URL` keeps pointing at
`http://<host>:5000/api`.

Choosing N: start with the number of CPU cores of the host (each signer replica is a
full Node process that can saturate about one core while signing) and adjust based on
measurement. If you omit `--scale`, the file's default of 2 replicas is used.

## Operational caveats
- **Run one mode at a time.** `docker-compose.yml` and `docker-compose.cluster.yml`
  both publish host port 5000 and share the same volumes. Stop one before starting the
  other (`docker compose down` / `docker compose -f docker-compose.cluster.yml down`).
- **Key generation stays single-process.** Never generate keys concurrently from
  multiple processes against the same SoftHSM token — nginx enforces this by routing
  all of `/api/hsm/` to `customer-server-primary` only.
- **Generate keys BEFORE scaling signers.** Each signer loads the token contents when
  it starts. Keys generated afterwards (via the primary) are not visible to already
  running signers until they are restarted:
  `docker compose -f docker-compose.cluster.yml restart customer-server-signer`
- **The shared token is safe for concurrent signing only.** Do not run any other
  writer (key generation, key deletion, token re-init) while signers are up.
- **Single host only.** Do not share a SoftHSM token volume across machines; the
  file-backed object store is not a networked HSM. To scale beyond one host, give each
  host its own token (i.e. its own keys) or use a real network HSM.

## SSL / TLS in each mode
- **Single-process mode:** the Node server itself serves HTTPS when both
  `SELF_SIGNED_SSL_PRIV_KEY_PATH` and `SELF_SIGNED_SSL_CERT_PATH` point to existing
  files (see [Support for self signed certificate](#support-for-self-signed-certificate)
  below for how to create them and how the Agent trusts them).
- **Cluster mode:** TLS is terminated by nginx; the customer-server replicas always
  speak plain HTTP on the internal Docker network and are never exposed on the host
  (the compose file forces `SELF_SIGNED_SSL_*` empty in the backends). Cluster mode
  runs without TLS by default. To enable it:
  1. Create `env/priv-key.txt` and `env/self-signed-cert.txt` exactly as described in
     [Support for self signed certificate](#support-for-self-signed-certificate)
     (steps 1-5; skip the server env variables — they are for single-process mode).
  2. In `docker-compose.cluster.yml`, uncomment the two cert/key mounts on the `nginx`
     service.
  3. In `nginx.conf`, comment out `listen 5000;` and uncomment the `listen 5000 ssl;`
     block (`ssl_certificate` + `ssl_certificate_key`).
  4. Restart: `docker compose -f docker-compose.cluster.yml up -d --force-recreate nginx`
  5. Point the Agent at `https://<host>:5000/api` and, for a self-signed certificate,
     set `SSL_CERT_PATH` in the Agent env file as described below.

# Support for self signed certificate
The server can support self signed certificate when accepting SSL connections from the Agent.
Note: this per-process SSL setup applies to the default single-process mode. In
[cluster mode](#running-in-cluster-mode-optional), TLS is terminated by nginx instead —
steps 1-5 below are still the way to create the key and certificate files.
In order to run the server with self signed certificate, follow the following steps:
1. Make sure to have an openssl Subject Alternative Name (SAN) certificates configuration file
   - You can find an example file at examples/server/env/san.cnf
2. Create a private key using openssl
   - `openssl genrsa -out priv-key.txt 2048`
3. Create a Certificate certificate signing requests (CSR) file
   - `openssl req -new -key priv-key.txt -out csr.txt -config san.cnf`
4. Create a self signed certificate
   - `openssl x509 -req -days 3650 -in csr.txt -signkey priv-key.txt -out self-signed-cert.txt -extfile san.cnf -extensions v3_req`
5. Validate the self signed certificate has all the information required
   - `openssl x509 -in self-signed-cert.txt -noout -text`
6. Add two parameters to your server environment file (e.g. /example/server/env/dev.env)
   - `SELF_SIGNED_SSL_PRIV_KEY_PATH="./env/priv-key.txt"
      SELF_SIGNED_SSL_CERT_PATH="./env/self-signed-cert.txt"`
7. Start the server, it will automatically run in SSL if the defined files are found
8. In order for the Agent to accept the self signed certificate, add the following to the Agent env file (e.g. .env.prod)
   - `SSL_CERT_PATH="./examples/server/env/self-signed-cert.txt"`
