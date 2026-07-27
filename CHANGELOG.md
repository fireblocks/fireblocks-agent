# 2.4.1 (2026-07-27)

### Bug Fixes

* **transport:** include `sessionContext` (access token) in the WebSocket broadcast payload to MAG
  - Without it MAG rejects the frame, so sign responses never reach Fireblocks and transactions sit in `PENDING_SIGNATURE` indefinitely
  - Affects every 2.4.0 deployment using WebSocket delivery — i.e. the default — so upgrading is required
  - Added coverage for `broadcastResponse` access-token resolution failures

### Features

* **examples:** Thales Luna Network HSM support for the example customer server
  - New `Dockerfile.luna` — Ubuntu 22.04 image bundling the Luna client
    (`libCryptoki2_64.so`, `lunacm`, `vtl`). The proprietary vendor tarball is never committed;
    supply it at build time in the gitignored `examples/server/luna/`. linux/amd64 only
  - New `luna-entrypoint.sh` — idempotent client registration against the appliance plus
    `vtl verify` at startup; skipped entirely when `LUNA_HOST` is unset, so the same image
    still runs in SoftHSM mode
  - PKCS#11 facade parameterized via `HSM_MODULE` / `HSM_PIN` / `HSM_SLOT_LABEL`, making HSM
    provider selection runtime configuration rather than a code change
  - Signing resilience for Luna sessions
* **examples:** example customer server base image migrated Alpine → Ubuntu 22.04
  (glibc, required by the Luna client)

# 2.4.0 (2026-07-22)

### Features

* **transport:** WebSocket push delivery, default-on (opt out with `WEBSOCKET_ENABLED=false`)
  - Agent receives messages via MAG's `/msg/ws` WebSocket endpoint instead of HTTP long-polling
  - Message acks ride the socket; sign responses continue to use HTTP
  - Three-layer liveness: handshake watchdog, app-level ping/keep-alive, TCP SO_KEEPALIVE
  - Exponential backoff with jitter on reconnect; fresh access token fetched per attempt
* **resilience:** process-level `unhandledRejection` and `uncaughtException` handlers
* **examples:** cluster mode for the example customer server — nginx load balancer in front of a
  pool of signer replicas; see `docs/cluster-setup-guide.md`

# 1.7.0 (2023-12-21)


### Features

* **docker:** wip- prepare installation
* **installation:** wip

# 1.6.0 (2023-12-20)


### Features

* **verify:** verify metadata and encodedMessage with zService and policy service
* **verify:** verify metadata and zService jwt

# 1.5.0 (2023-12-18)


### Features

* **integration:** wip starting to connect the dots

# 1.4.0 (2023-12-18)


### Features

* **example server:** support multi algorithms

# 1.3.0 (2023-12-17)


### Features

* **customer server:** randomly sign or reject transactions

# 1.2.0 (2023-12-12)


### Features

* **example server:** add pem public key to generateKeyPair

# 1.1.0 (2023-12-11)


### Features

* **customer server:** add softHsm

# 1.0.0 (2023-12-07)


### Features

* **accessToken:** get access token in loop
* **agent:** pair flow
* **build:** try to add to CI
* **ci:** fix build
* **CI:** integrating w/ CI
* **customer server client:** add customer server client + example server implementation
* **customerServer:** hsm <> customer server communication
* **env:** add support for dev env
* **loop:** wip add handle message logic
* **main loop:** pull messages
* **messageService:** closed the loop from getting a message through sending it to customer server
* **pair:** working pair flow
