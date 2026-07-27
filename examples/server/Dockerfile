# Customer server example — Ubuntu (glibc) base.
#
# Migrated from alpine:3.15 (musl) to ubuntu:22.04 (glibc). Thales Luna's client
# ships a glibc-linked PKCS#11 module (libCryptoki2_64.so) that will not load under
# musl, so a glibc base is required for the Luna client. glibc is also fine — and
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

# Node.js 18 via NodeSource (keyring-based apt repo; no piping a remote script to a shell).
RUN curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
      | gpg --dearmor -o /usr/share/keyrings/nodesource.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_18.x nodistro main" \
      > /etc/apt/sources.list.d/nodesource.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

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
# Accepted risk: this is the local example/reference customer server (not the shipped
# agent). It runs as root by design — the SoftHSM/Luna HSM setup writes to system paths
# (/tokens, /usr/safenet, /etc) that require root, and this image is only used for local
# demos. Same posture as prior releases. Not hardened to non-root deliberately.
# nosemgrep: dockerfile.security.missing-user.missing-user
CMD ["npm", "run", "start:dev"]
