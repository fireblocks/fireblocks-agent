# Start your image with a node base image
FROM node:18-alpine

# The /app directory should act as the main application directory
WORKDIR /app

# Copy the app package and package-lock.json file
COPY package*.json ./
COPY tsconfig.json ./

# Copy local directories to the current local directory of our docker image (/app)
COPY .env.prod ./
COPY ./src ./src
COPY ./api ./api

RUN apk add --no-cache bash

# Install node packages, install pm2, build the app, and remove dependencies at the end
RUN npm install \
    && npm install pm2 -g \
    && npm run build 
#    && rm -fr node_modules

#EXPOSE 3000

# Start the app using serve command
CMD ["/bin/bash", "-c", "pm2 start dist/index.js && pm2 attach 0"]