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

# [1.7.0](https://gitlab.com/fireblocks/shell/common/hsm-agent/compare/v1.6.0...v1.7.0) (2023-12-21)


### Features

* **docker:** wip- prepare installation ([e4ab3a8](https://gitlab.com/fireblocks/shell/common/hsm-agent/commit/e4ab3a8f72e876b41b60884b759c7c4ce3c09ac8))
* **installation:** wip ([4a2865b](https://gitlab.com/fireblocks/shell/common/hsm-agent/commit/4a2865bb36af82c56388e257704a8751676f740d))

# [1.6.0](https://gitlab.com/fireblocks/shell/common/hsm-agent/compare/v1.5.0...v1.6.0) (2023-12-20)


### Features

* **verify:** verify metadata and encodedMessage with zService and policy service ([075a715](https://gitlab.com/fireblocks/shell/common/hsm-agent/commit/075a7157bfc281eb637aa1eb1c9561b6cabf2672))
* **verify:** verify metadata and zService jwt ([d0d036e](https://gitlab.com/fireblocks/shell/common/hsm-agent/commit/d0d036e8d81a8a0dc5de85086e93dadeb28de502))

# [1.5.0](https://gitlab.com/fireblocks/shell/common/hsm-agent/compare/v1.4.0...v1.5.0) (2023-12-18)


### Features

* **integration:** wip starting to connect the dots ([1455e81](https://gitlab.com/fireblocks/shell/common/hsm-agent/commit/1455e816fbfe9592cf68f2d82dc7d4d334c3a317))

# [1.4.0](https://gitlab.com/fireblocks/shell/common/hsm-agent/compare/v1.3.0...v1.4.0) (2023-12-18)


### Features

* **example server:** support multi algorithms ([45a1fb7](https://gitlab.com/fireblocks/shell/common/hsm-agent/commit/45a1fb7a7529dac04ad71de11070be9aed61bcc3))

# [1.3.0](https://gitlab.com/fireblocks/shell/common/hsm-agent/compare/v1.2.0...v1.3.0) (2023-12-17)


### Features

* **customer server:** randomly sign or reject transactions ([bd76297](https://gitlab.com/fireblocks/shell/common/hsm-agent/commit/bd76297e8496d74e37ae1843fbe8d6a3d4e10108))

# [1.2.0](https://gitlab.com/fireblocks/shell/common/hsm-agent/compare/v1.1.0...v1.2.0) (2023-12-12)


### Features

* **example server:** add pem public key to generateKeyPair ([a07c402](https://gitlab.com/fireblocks/shell/common/hsm-agent/commit/a07c402240ffa80da0ef421052f20ccbe34090e6))

# [1.1.0](https://gitlab.com/fireblocks/shell/common/hsm-agent/compare/v1.0.0...v1.1.0) (2023-12-11)


### Features

* **customer server:** add softHsm ([cf0b386](https://gitlab.com/fireblocks/shell/common/hsm-agent/commit/cf0b3862ff8472a446de463b70d5e25e564387a5))

# 1.0.0 (2023-12-07)


### Features

* **accessToken:** get access token in loop ([b3398b2](https://gitlab.com/fireblocks/shell/common/hsm-agent/commit/b3398b282fb2471d7f81ea6e87eebbb50187ced6))
* **agent:** pair flow ([98ab453](https://gitlab.com/fireblocks/shell/common/hsm-agent/commit/98ab4531217d99944ce7738f7d3f56280891c5f1))
* **build:** try to add to CI ([eba0c49](https://gitlab.com/fireblocks/shell/common/hsm-agent/commit/eba0c493993e46ec1673cc7b9443ff18f0d361ce))
* **ci:** fix build ([25ef0c1](https://gitlab.com/fireblocks/shell/common/hsm-agent/commit/25ef0c120cb910b5f2ca82a437cab58c7aa84472))
* **CI:** integrating w/ CI ([2807319](https://gitlab.com/fireblocks/shell/common/hsm-agent/commit/2807319beb0411a70721f0e4502795c5bdd42db5))
* **customer server client:** add customer server client + example server imple ([5b0f380](https://gitlab.com/fireblocks/shell/common/hsm-agent/commit/5b0f38045b247acd3d2530956be4c4c086a8b450))
* **customerServer:** hsm <> customer server communication ([9cacf92](https://gitlab.com/fireblocks/shell/common/hsm-agent/commit/9cacf929fb985c1092381e2bc65c03356c6f1a15))
* **env:** add support for dev env ([8038819](https://gitlab.com/fireblocks/shell/common/hsm-agent/commit/803881944f30120ca7f9107342feda8f7c0e41bb))
* **loop:** wip add handle message logic ([cdd3813](https://gitlab.com/fireblocks/shell/common/hsm-agent/commit/cdd38130682f9f6aea46587960d21e9ce06f7d52))
* **main loop:** pull messages ([c8b5683](https://gitlab.com/fireblocks/shell/common/hsm-agent/commit/c8b56838241bb5ab9acb41296b31150e355af940))
* **messageService:** closed the loop from getting a message through sending it to customer server ([37aa62b](https://gitlab.com/fireblocks/shell/common/hsm-agent/commit/37aa62b3140179a373ecbb1bd0621792dd74b62d))
* **pair:** working pair flow ([c10ccee](https://gitlab.com/fireblocks/shell/common/hsm-agent/commit/c10ccee2184d5611e021c3527be9ff13f2fe971a))
