# 3.0.0 (2026-11-23)

### Breaking changes

* **tls:** the Agent refuses an `http://` `CUSTOMER_SERVER_URL` and stops at startup (exit status 2), unless `ALLOW_INSECURE_CUSTOMER_SERVER=true`, which is for local development only and logs a warning at every start. A missing `CUSTOMER_SERVER_URL`, or one with another scheme, also stops it. Migration:
  - Point `CUSTOMER_SERVER_URL` at the server's `https://` address, a name its certificate covers. KeyLink Flow serves HTTPS by default from v2026.11.23. Earlier releases serve HTTPS only when `SELF_SIGNED_SSL_CERT_PATH` and `SELF_SIGNED_SSL_PRIV_KEY_PATH` point to readable files. With v2026.11.23's Docker Compose files, `https://customer-server:5000/api` (or `https://customer-server-online:5000/api`) with `CUSTOMER_SERVER_CA_FILE` set to KeyLink Flow's `customer-server/dev-tls/ca.crt`.
  - The shipped `.env.prod` now defaults to `https://localhost:5000/api`.
  - Helm chart: `customerServer.url` must be `https://`; the render fails on `http://` unless `customerServer.allowInsecureHttp=true` (development clusters).
* **tls:** `CUSTOMER_SERVER_CA_FILE` replaces `SSL_CERT_PATH`, which still works with a deprecation warning; setting both is an error. The file is now trusted in addition to the default CA certificates (Node's bundled roots and `NODE_EXTRA_CA_CERTS`) instead of replacing them, and may hold several certificates.
* **tls:** a configured CA file that cannot be read, or holds no certificate, stops the Agent at startup instead of being ignored (this reverses the 2.x behaviour where a missing `SSL_CERT_PATH` file was skipped). Check the path and that UID 1000 can read it.
* **docker:** the image runs the Agent directly with `node dist/index.js`, under `tini` as the init process, instead of under `pm2`, so the container stops when the Agent exits. **Action required for Docker users:** `pm2` used to restart the Agent inside the container after a crash; now nothing does unless you set a restart policy (`--restart unless-stopped`, `restart: unless-stopped` in Docker Compose, or `restartPolicy: Always` in Kubernetes), so set one before you upgrade. The README's upgrade notes say the same. The image has no `bash` and no `pm2`: run commands in it with `sh`. The Agent no longer waits 2 seconds at startup with `NODE_ENV=prod`, a wait that only `pm2` needed.

### Features

* **tls:** the startup banner shows how the Customer Server connection is checked (`Customer server TLS: HTTPS, verified against the default CA certificates and 1 from CUSTOMER_SERVER_CA_FILE`) instead of the raw certificate path. The Agent's connections to Fireblocks are unchanged: always the default CA certificates, with no way to turn verification off
* **helm:** `customerServer.trustServiceCa` (on by default): on OpenShift, with an `https://` URL and no `customerServer.ca`, the chart creates a ConfigMap OpenShift injects its service CA into, and the Agent trusts it, so an Agent pointed at KeyLink Flow with `serviceTls` needs no CA setting. `customerServer.ca` is passed as `CUSTOMER_SERVER_CA_FILE`

* **openshift:** the image runs under Red Hat OpenShift's default restricted-v2 policy
  - Built in a separate stage; the final image holds only `dist`, production dependencies, `package.json` and `.env.prod`, and the code and its dependencies belong to root
  - Only `/app/logs` and `/app/data` are writable, by UID 1000 and by group `0` with the same permissions, so the random user ID in group `0` that OpenShift assigns can run it. `/app` and the code directory `dist` stay root-owned and read-only, so the Agent cannot replace its own code
* **secrets:** `FB_DEVICE_DATA_FILE` and `CUSTOMER_SERVER_AUTHORIZATION_FILE` read those settings from files, for example Kubernetes Secrets mounted as files, so they stay out of the container's environment. Setting both a variable and its file is refused, and errors never contain the value
* **logging:** `LOG_DIR` sets the directory for log files and `LOG_TO_FILE=false` logs to the console only, for a read-only root filesystem. By default nothing changes
* **pairing:** `DEVICE_DATA_PATH` sets the file where the Agent stores an interactively paired device's credentials. The image sets it to `/app/data/.fireblocks-refresh-token`; outside the image the default is unchanged (`dist/.fireblocks-refresh-token`)
* **proxy:** the connections to Fireblocks (REST calls, the signing WebSocket and pairing) go through an outbound HTTPS proxy when `HTTPS_PROXY` is set, honoring `NO_PROXY`, as `CONNECT` tunnels so TLS to Fireblocks stays end to end
  - The WebSocket uses `https-proxy-agent` 7.0.6 with `proxy-from-env` 2.1.0, the resolver axios already uses for the REST calls
  - Calls to the Customer Server never use the proxy
  - `HTTPS_PROXY_FILE` and `HTTP_PROXY_FILE` read a proxy URL with credentials from a file; the startup log shows the route without credentials
  - A TLS-inspecting proxy's root CA is trusted through Node's `NODE_EXTRA_CA_CERTS`; certificate checks are never turned off
  - Helm chart: `proxy.url` or `proxy.existingSecret`, `proxy.cidrs`, `proxy.port`, `proxy.noProxy` and `caBundle`, applied to the Agent and the pairing step (not the pairing Job's `oc` step); with a proxy, the NetworkPolicies allow egress to the proxy only
* **docs:** two OpenShift diagrams in the chart README, generated by `docs/diagrams-src/build_diagrams.py`: the Agent's deployment (`docs/flows/openshift-deployment.png`) and pairing with the pairing Job (`docs/flows/openshift-pairing.png`). The Docker pairing diagram is unchanged
* **helm:** a Helm chart in `deploy/helm/fireblocks-agent` for Kubernetes and Red Hat OpenShift: the Agent (one replica, `Recreate`), its device-data Secret, a one-time pairing Job and NetworkPolicies, for any Customer Server (`customerServer.url`, an Authorization key from an existing Secret, an optional CA for an HTTPS server)
  - The pairing Job's `oc` image defaults to `registry.redhat.io/openshift4/ose-cli-rhel9:v4.18`, pinned by digest; `image.digest` pins the Agent image. The README covers the Red Hat pull secret and mirroring for disconnected clusters
  - IPv6 addresses in `customerServer.url` and `proxy.url` give the right port in the NetworkPolicies
  - `networkPolicy.customerServerPort` sets the Customer Server pod's container port for the Agent's NetworkPolicy, for a Service whose port differs from it; by default the port comes from `customerServer.url`
  - `test/render.sh` lints and renders every `ci/` values file and checks each render guard
  - A liveness probe, on by default (`livenessProbe.*`): it restarts the Agent when the heartbeat file the Agent writes (`HEARTBEAT_FILE`, in the pod's `/tmp` volume) is older than `livenessProbe.maxAgeSeconds` (300 by default)
  - `values.schema.json` checks the type of every value and refuses unknown value names, so a misspelt value fails the install instead of being ignored. Free-form values (`resources`, `extraEnv`, `customerServerPeers`, the security contexts) are passed through
  - With `pairing.enabled` left on after a successful pairing, the next upgrade's pairing Job fails at once with a message that says why (the pairing-token Secret it deleted is gone), instead of waiting for the missing Secret until its 4-minute deadline. The token Secret is mounted as optional and the pair step checks for it before it starts, which works the same with the Helm command line and with Argo CD
  - `platform: kubernetes` for Kubernetes other than OpenShift, for example Google Kubernetes Engine: every pod runs as the Agent image's user (1000, `kubernetes.podSecurityContext`), the pairing Job writes the device-data Secret and deletes the pairing-token Secret with `kubectl` from `registry.k8s.io/kubectl`, pinned by digest (`pairing.cli`, `pairing.kubectlImage`), with the same Role, and the DNS egress rule opens port 53 only. `platform: openshift`, the default, is unchanged
  - The README asks for encryption of etcd data at rest, since the device credentials live in a Secret, and covers etcd backups and who can read Secrets in the namespace
* **health:** `HEARTBEAT_FILE` names a file the Agent writes the current time to (whole seconds since the epoch, at most every 5 seconds) while its connection loop to Fireblocks makes progress: each connection attempt, the WebSocket opening, each answered keep-alive ping, each long poll. A liveness check that finds the time too old can restart the Agent. Failing connection attempts still count, so an outage at Fireblocks or at a proxy does not make the file go stale. Unset by default: nothing is written
* **pairing:** `node dist/pair.js` pairs without a prompt, for a one-time job: it reads the pairing token from `PAIRING_TOKEN_FILE`, writes the device credentials to `DEVICE_DATA_OUTPUT_FILE` and exits. It checks that it can write the output before it spends the token, never overwrites an existing file, writes nothing else, and logs neither the token nor the refresh token. If pairing succeeds but the output can't be written, it says so: the token is spent. A wrong `_FILE` setting exits with status `2`, like the other wrong settings

### Bug Fixes

* **logging:** correct the `massages` typo in the status-update log line — it now reads `Number of messages in cache`
* **startup:** the Agent exits with code 1 when its credentials file cannot be read or parsed, instead of logging the error and staying idle.

### Security

* **docker:** the image runs as the non-root `node` user (UID 1000) instead of root. Files you mount, such as an `SSL_CERT_PATH` certificate, must be readable by that user. If you mount the credentials file from the host or a volume, chown it to UID 1000 (otherwise the Agent exits with `EACCES`), or switch to `FB_DEVICE_DATA`. A volume the Agent writes to (`/app/logs` for its log files, or `/app/data` for an interactively paired device's credentials) must be writable by UID 1000.
* **docker:** the image's log files and credentials file moved out of the code: log files go to `/app/logs` (`LOG_DIR`) instead of `/app`, and an interactively paired device's credentials to `/app/data/.fireblocks-refresh-token` (`DEVICE_DATA_PATH`) instead of `/app/dist/.fireblocks-refresh-token`. A paired Docker install keeps working: when the new file is missing, the Agent reads `/app/dist/.fireblocks-refresh-token` (for example a file you mount there) and logs a warning. To migrate, mount the credentials file at `/app/data/.fireblocks-refresh-token` instead, or better, pass it as `FB_DEVICE_DATA` or `FB_DEVICE_DATA_FILE`.
* **docker:** the base image is pinned by digest, so a rebuilt `node:24.22.1-alpine` tag cannot change it.

### Chores

* **docker:** the image installs dependencies with `npm ci`, so it uses exactly the versions in `package-lock.json`.
* **docker:** `docker build --build-arg NPM_REGISTRY=<url>` installs dependencies from a private npm registry or mirror.

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
