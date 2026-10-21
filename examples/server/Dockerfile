# Customer server example — Ubuntu (glibc) base.
#
# Migrated from alpine:3.15 (musl) to ubuntu:22.04 (glibc). Thales Luna's client
# ships a glibc-linked PKCS#11 module (libCryptoki2_64.so) that will not load under
# musl, so a glibc base is required for Phase 2 (Luna). glibc is also fine — and
# quicker to provision (prebuilt apt package vs. source build) — for SoftHSM.
#
# NOTE: on Ubuntu/apt the SoftHSM PKCS#11 module lives at
#   /usr/lib/softhsm/libsofthsm2.so
# (Alpine placed it at /usr/local/lib/softhsm/libsofthsm2.so). This is the default
# HSM_MODULE in src/services/hsm-facade.ts.
FROM ubuntu:22.04

LABEL org.label-schema.description="Fireblocks KeyLink customer server example (SoftHSM2 on Ubuntu; Thales Luna-ready)"
LABEL org.label-schema.name="fireblocks-customer-server"
LABEL org.label-schema.schema-version="1.0"

ENV DEBIAN_FRONTEND=noninteractive

# SoftHSM2 configuration file location. Ubuntu's conventional path is
# /etc/softhsm/softhsm2.conf; the config we copy in sets directories.tokendir = /tokens/.
ENV SOFTHSM2_CONF=/etc/softhsm/softhsm2.conf

# System dependencies:
#   softhsm2                   - PKCS#11 provider (/usr/lib/softhsm/libsofthsm2.so) + softhsm2-util
#   opensc                     - pkcs11-tool and related PKCS#11 utilities
#   build-essential, python3   - toolchain for compiling the pkcs11js native addon (node-gyp)
#   curl, ca-certificates, gnupg - to add the NodeSource apt repository
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     softhsm2 \
     opensc \
     build-essential \
     python3 \
     curl \
     ca-certificates \
     gnupg \
  && rm -rf /var/lib/apt/lists/*

# Node.js 24 via NodeSource (keyring-based apt repo; no piping a remote script to a shell).
# node_24.x picks up the October 2026 Node security releases that remove the compromised
# eMudhra intermediates from the bundled root list
# (https://nodejs.org/en/blog/vulnerability/october-2026-security-releases). Node 18 is EOL
# and Node 20 is not receiving the fix, so this image moves to the 24.x line to stay on a
# supported, fixed train. The NodeSource repo can lag a security release (it served 24.22.0 for
# hours after 24.22.1 shipped), so the next step fails the build instead of shipping an older Node.
RUN curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
      | gpg --dearmor -o /usr/share/keyrings/nodesource.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" \
      > /etc/apt/sources.list.d/nodesource.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

RUN node -e 'const [major, minor, patch] = process.versions.node.split(".").map(Number); if (major !== 24 || minor < 22 || (minor === 22 && patch < 1)) throw new Error("Node.js 24.22.1 or newer is required, found " + process.version)'

# ca-certificates 20260816ubuntu0.22.04.1 is the first Ubuntu 22.04 build without the compromised
# eMudhra intermediates' roots; fail the build rather than ship an older system trust store.
RUN dpkg --compare-versions "$(dpkg-query -W -f='${Version}' ca-certificates)" ge 20260816ubuntu0.22.04.1

# Fail fast if the SoftHSM PKCS#11 module is not where the app expects it
# (keeps this base image in sync with the HSM_MODULE default in hsm-facade.ts).
RUN test -f /usr/lib/softhsm/libsofthsm2.so

WORKDIR /app

# SoftHSM config + token store. The token is initialized at build time
# (npm run initToken); docker-compose persists /tokens via a named volume.
COPY softhsm2.conf /etc/softhsm/softhsm2.conf
RUN mkdir -p /tokens

COPY ./src ./src
COPY ./env ./env
COPY package*.json ./
COPY tsconfig.json ./

# Initialize the SoftHSM token (writes into /tokens per SOFTHSM2_CONF).
RUN npm run initToken

# Install dependencies (compiles the pkcs11js native addon) and build TypeScript.
# build:api (OpenAPI type generation) runs on the host as part of `npm run build:docker`,
# emitting src/customer-server.d.ts into the build context before the COPY above.
RUN npm install \
  && npm run build

EXPOSE 5000
# CMD npm run start
CMD ["npm", "run", "start:dev"]
