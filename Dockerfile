# Fireblocks Agent image.
#
# Runs the Agent with node as the container's main process, under tini, so if the Agent exits (an
# uncaught error, or unpaired with no terminal) the container stops with its exit code and Docker's
# or Kubernetes' restart policy applies, instead of a supervisor hiding the failure.
#
# Runs as the non-root `node` user (UID/GID 1000) under Docker. Red Hat OpenShift's default
# restricted-v2 policy runs it as a random user ID in group 0 instead, usually with a read-only root
# filesystem, so everything the Agent may write also belongs to group 0 with the owner's
# permissions. With a read-only root, set LOG_TO_FILE=false (or LOG_DIR to a mounted volume) and
# supply the device data with FB_DEVICE_DATA_FILE; then nothing is written to the image.
#
# Node 24.22.1 is one of the October 2026 Node security releases that remove the compromised
# eMudhra intermediates from the bundled root list
# (https://nodejs.org/en/blog/vulnerability/october-2026-security-releases); 18 is EOL and 20 is
# not receiving the fix.
# Pinned by digest (the multi-arch index, the same one customer-server uses), so a rebuilt tag
# cannot change the image under us. Update the digest together with the version, in both stages.

FROM node:24.22.1-alpine@sha256:6a1c190e17215d844926b0677f4bf87273ff7d5e54db06d3b5b5863ab0b09a3d AS build

# Pass --build-arg NPM_REGISTRY=<url> to use a custom registry (e.g. for private mirrors). The
# lockfile's registry.npmjs.org URLs are then fetched from this registry (npm's default
# replace-registry-host=npmjs). The setting stays in this build stage and never reaches the final
# image.
ARG NPM_REGISTRY=""
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi

WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
# npm ci, not npm install: it installs exactly what package-lock.json lists and fails when the
# lockfile and package.json disagree, so every build gets the same dependency versions.
# --ignore-scripts: the only install script is the husky git hook setup, which needs a git checkout.
RUN npm ci --ignore-scripts
COPY api ./api
COPY src ./src
COPY .env.prod ./
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:24.22.1-alpine@sha256:6a1c190e17215d844926b0677f4bf87273ff7d5e54db06d3b5b5863ab0b09a3d

# tini is the container's init process: the Agent registers no signal handlers, so as PID 1 it
# would ignore SIGTERM and `docker stop` (or a pod deletion) would wait for the kill timeout.
# Also refresh ca-certificates so the system trust store (which some tooling and native modules
# consult directly) carries the Alpine 20261020-r0+ update that removes the compromised eMudhra/AAA
# roots. The Agent itself trusts Node's bundled roots, fixed in 24.22.1, plus NODE_EXTRA_CA_CERTS
# when set. ca-certificates is pulled in explicitly because node:*-alpine only ships
# ca-certificates-bundle, so update-ca-certificates would be missing without it.
RUN apk add --upgrade --no-cache tini ca-certificates ca-certificates-bundle && \
    update-ca-certificates

WORKDIR /app
# /app, the code and its dependencies (package.json, .env.prod, node_modules, dist) belong to root
# and are not writable by the Agent: it can't replace, rename or delete them, because that takes
# write permission on the directory that holds them.
COPY --from=build /app/package.json ./
COPY --from=build /app/.env.prod ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# The Agent writes only to two directories of its own, outside the code: log files to /app/logs
# (unless LOG_TO_FILE=false, or LOG_DIR names another directory) and an interactively paired
# device's credentials to /app/data (DEVICE_DATA_PATH). They belong to the node user (UID 1000),
# and to group 0 with the same permissions for the random user ID that OpenShift assigns.
RUN mkdir /app/logs /app/data && \
    chown 1000:0 /app/logs /app/data && \
    chmod 0770 /app/logs /app/data
ENV LOG_DIR=/app/logs \
    DEVICE_DATA_PATH=/app/data/.fireblocks-refresh-token

# Everything from here runs as non-root. The numeric UID lets Kubernetes verify runAsNonRoot.
USER 1000:1000

# The Agent is the container's main process: when it exits, the container stops with its exit
# code, so a restart policy (or Kubernetes) sees the failure instead of a supervisor hiding it.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
