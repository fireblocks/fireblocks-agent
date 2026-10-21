# 2.4.4 (2026-10-21)

### Security

* **runtime:** move the agent image and source runtime to Node.js 24.22.1, and the example server to the Node.js 24 release line, to pick up the October 2026 eMudhra CA distrust update. Refresh the agent image's Alpine CA certificates so its system trust store also removes the distrusted eMudhra certificates, roots, and cross-signs.
* **example server:** the SoftHSM and Luna example images now fail the build if NodeSource installs a Node.js older than 24.22.1 (the repository can lag a security release by hours), or if Ubuntu's `ca-certificates` is older than `20260816ubuntu0.22.04.1`, so they cannot silently ship the old trust stores.

# 2.4.3 (2026-10-05)

### Bug Fixes

* **transport:** bound the WebSocket connection attempt so a stalled access-token fetch cannot deadlock the reconnect chain
  - `connect()` began with an un-timeboxed `await getAccessToken()`, entered from a reconnect timer that had already cleared itself. During that await the client held no socket and no armed timer, so a gateway that accepted the TCP connection and then never responded — no RST, no FIN — left nothing that could ever run again. The `catch` that would have rescheduled needs a rejection, and a hang is the absence of an event
  - Push mode has no concurrent long-poll, so the reconnect chain is the only delivery mechanism. One occurrence left an agent deaf to Fireblocks for 39 hours while presenting as fully healthy; recovery required a manual restart
  - New `WS_CONNECT_TIMEOUT_MS` (default `60000`) covers the whole attempt including the token fetch, handing over to the existing open watchdog once a socket exists. An attempt counter prevents an abandoned fetch that settles late — whether it resolves or fails — from disturbing the connection that replaced it. The counter advances the moment the watchdog gives up, so a fetch that lands during the backoff gap is fenced too

* **transport:** ignore socket events from a superseded WebSocket generation
  - `open`, `pong`, and `message` ran unconditionally, unlike `close` and `error`. `terminate()` does not retract an `open` already queued on the event loop, so a socket the open watchdog had just torn down could still rebind the keep-alive interval to itself — and that interval stops on its first tick, leaving the live connection with no keep-alive for the rest of its life
  - A `pong` from a replaced socket likewise marked the current connection alive, suppressing a round of half-dead detection, and a `message` on one would have been signed against an ack that silently no-ops

* **customer-server:** deadlines on the customer-server calls
  - `messagesStatus` and `messagesToSign` were unbounded in exactly the way `access_token` was. A hung `messagesStatus` is a permanent wedge, not a slow call: the status-poll loop schedules its next run only after the current one settles, so a customer server that accepts the connection and goes silent stops status updates for the life of the process
  - `CUSTOMER_SERVER_TIMEOUT_MS` (default `30000`) and `CUSTOMER_SERVER_SIGN_TIMEOUT_MS` (default `120000`), split because `messagesToSign` waits on the customer's HSM rather than a lookup

### Features

* **pairing:** start already paired from `FB_DEVICE_DATA`
  - Supplies an already-paired `{userId, deviceId, refreshToken}`, so a container pairs without a TTY and survives a restart with no persistent storage. Pair once elsewhere and copy the file
  - Bearer credential: supply from a secret manager, never a committed `.env`. Only its use is logged, never its value
  - Exits instead of hanging when unpaired with no TTY. The prompt never settles without a terminal, so the container would stay Ready while the agent silently did nothing

* **transport:** deadlines on the Mobile API Gateway HTTP calls
  - `FB_HTTP_TIMEOUT_MS` (default `30000`) applies to `access_token`, `pair_device`, `get_service_certificates`, the `msg` ack, and the HTTP broadcast. Node's HTTP client applies no deadline of its own, and no timeout was configured anywhere in the repo
  - `FB_LONG_POLL_TIMEOUT_MS` (default `90000`) applies to `getMessages` only, which the gateway deliberately holds open. Bounded rather than exempt: in HTTP mode the poll loop has no other liveness check, so one unsettled request stops delivery for the life of the process. Sized from production APM — the gateway's poll window is ~20s (p99 20.24s) under a 60s infrastructure ceiling, so 90s clears both while keeping detection latency low
  - The agent warns at startup if `FB_HTTP_TIMEOUT_MS` is configured at or above `WS_CONNECT_TIMEOUT_MS`. That ordering is load-bearing — the connect watchdog is the backstop and must fire second — but both are independently tunable, so it is checked rather than assumed

### Chores

* **config:** load the logger after `dotenv.config()` rather than through a hoisted static import — winston pulls in modules that read `process.env` at module scope (`@dabh/diagnostics`). No `.env*` in this repo sets the vars in question, so nothing was misconfigured; this removes the hazard and drops `constants.ts`'s static dependency on `services/`
* **tests:** restore `process.env` in the two request-deadline suites, which pointed a gateway URL at an ephemeral port they then closed — `npm test` runs `--runInBand`, so every test file shares one process

### Docs

* **licence:** add `LICENSE.md` — the Fireblocks Key Link Agent Licence. The repository previously shipped with no licence file at all, and the README described the agent as "open-source", which it is not: the source is published so customers can install, run and audit it, but it remains Fireblocks' proprietary software and the licence expressly is not an open source licence. The README now states this and carries a Licence section, and the example server's `package.json` no longer claims `ISC`

# 2.4.2 (2026-07-28)

### Security

* **deps:** upgrade `axios` `^1.6.2` → `^1.18.1` — remediates CVE-2026-44492 (SSRF) and CVE-2026-44487 (Proxy-Authorization leak) plus three further axios CVEs
* **deps:** remove `pm2` from production dependencies — pm2 is installed globally in the container image; the unused package entry carried a CVE column (`ip` SSRF, `systeminformation`, `ws@7.4.6`, bundled `axios@0.21.4`)
* **deps:** override `jws` to `^3.2.3` — resolves the HMAC verification advisory (GHSA-869p-cjfg-cm3x / CVE-2025-65945) on the vulnerable `jws` versions pulled in transitively by `jsonwebtoken`

### Chores

* **deps:** bump `@types/node` to `^22.0.0` (Node 22 LTS) and drop `skipLibCheck` — resolves the axios type incompatibility at the root rather than suppressing declaration-file type checking globally

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

# 2.2.8 (2025-01-15)

### Performance

* **agent:** the agent polls for the next batch of messages without waiting for the current batch to be signed and acknowledged; handling runs in the background and its errors are logged

# 2.2.7 (2024-12-23)

### Security

* **transport:** stop writing the Fireblocks access token to `accessToken.log` in the working directory on every token refresh

# 2.2.6 (2024-12-04)

### Features

* **examples:** `POST /signRequest/:requestId` on the example customer server signs a single pending request, for Cold mode; the example's default `HSM_MODE` is now `HOT`

# 2.2.5 (2024-12-03)

### Bug Fixes

* **messages:** a message from Fireblocks that fails signature verification is acknowledged and discarded instead of being delivered again; the error log names its `msgId`, type and `requestId`

# 2.2.4 (2024-10-10)

### Bug Fixes

* **examples:** the example customer server called `logger.warning`, which doesn't exist, when it couldn't read its database statistics; it now calls `logger.warn`

# 2.2.3 (2024-09-30)

### Features

* **pairing:** support re-enrolling a device: Fireblocks now assigns the device ID at pairing, instead of the agent generating one
* **messages:** a message leaves the agent's cache once its response is acknowledged
* **logging:** the agent version appears in the startup output and the "waiting for messages" log, with more logging of cache and batch sizes
* **examples:** the example customer server stores only messages it hasn't seen, leaving existing ones untouched, and logs signing statistics

# 2.1.2 (2024-08-12)

### Features

* **transport:** signed responses are broadcast in batches of `BROADCAST_BATCH_SIZE` (default `30`)

# 2.1.1 (2024-08-08)

### Features

* **messages:** better handling of large message volumes
  - Broadcasts and acks for a batch run concurrently instead of one at a time
  - A response is broadcast even when its message has no current `msgId`, and acknowledged only when it has one; a change in Fireblocks' `msgId` prefix invalidates the cached IDs
  - `AGENT_REQUESTS_CACHE_SIZE` default raised from `1024` to `2048`
* **examples:** the example customer server signs on receipt only when `HSM_MODE` is `HOT`; in `COLD` it stores messages until `POST /signAllPendingMessages` (optionally in random order with `SIGNING_ORDER=RANDOM`)

# 2.0.1 (2024-07-21)

### Bug Fixes

* **messages:** a message that can't be decoded or verified is logged and skipped instead of failing the rest of its batch
* **tls:** an `SSL_CERT_PATH` that points at a missing file no longer stops the agent from starting

# 2.0.0 (2024-07-18)

Agent V2: new message format and signing flow.

### Features

* **messages:** new message structure, including proof-of-ownership messages for external keys; signed responses are broadcast to Fireblocks with the original message payload
* **transport:** requests to Fireblocks carry `User-Agent: FireblocksAgent/<version>`
* **tls:** customer servers with a self-signed certificate, via `SSL_CERT_PATH`; keep-alive connections to the customer server
* **config:** `CUSTOMER_SERVER_AUTHORIZATION`, `CUSTOMER_SERVER_PULL_CADENCE_MS` and `AGENT_REQUESTS_CACHE_SIZE`; production is the default environment
* **logging:** daily rotating log files, with timestamps
* **examples:** the example customer server's HSM layer was rewritten without external dependencies, adds EdDSA and checks for supported algorithms, and can serve HTTPS with a self-signed certificate

### Bug Fixes

* **agent:** network errors and exceptions while handling messages no longer crash the agent; unexpected responses from the customer server are ignored

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
* **customer server client:** add customer server client + example server imple
* **customerServer:** hsm <> customer server communication
* **env:** add support for dev env
* **loop:** wip add handle message logic
* **main loop:** pull messages
* **messageService:** closed the loop from getting a message through sending it to customer server
* **pair:** working pair flow
