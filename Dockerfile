# Start your image with a node base image. 24.22.1 is one of the October 2026 Node security
# releases that remove the compromised eMudhra intermediates from the bundled root list
# (https://nodejs.org/en/blog/vulnerability/october-2026-security-releases); 18 is EOL and 20
# is not receiving the fix.
FROM node:24.22.1-alpine

# The /app directory should act as the main application directory
WORKDIR /app

# Copy the app package and package-lock.json file
COPY package*.json ./
COPY tsconfig.json ./

# Copy local directories to the current local directory of our docker image (/app)
COPY .env.prod ./
COPY ./src ./src
COPY ./api ./api

# Keep bash for the start command, and refresh ca-certificates so the system trust store (which
# some tooling and native modules consult directly) carries the Alpine 20261020-r0+ update that
# removes the compromised eMudhra/AAA roots. The agent process itself trusts Node's bundled
# roots, which the base image already carries fixed via 24.22.1. ca-certificates is pulled in
# explicitly because node:*-alpine only ships ca-certificates-bundle, so update-ca-certificates
# would be missing without it.
RUN apk add --upgrade --no-cache bash ca-certificates ca-certificates-bundle && \
    update-ca-certificates

# Install node packages, install pm2, build the app, and remove dependencies at the end
RUN npm install \
    && npm install pm2 -g \
    && npm run build 
#    && rm -fr node_modules

# Start the app using serve command
CMD ["/bin/bash", "-c", "pm2 start dist/index.js && pm2 attach 0"]