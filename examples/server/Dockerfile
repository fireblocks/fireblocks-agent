FROM alpine:3.15 AS build

ARG SOFTHSMV2_VERSION=2.6.1

RUN apk add --no-cache \
  autoconf \
  automake \
  build-base \
  libtool \
  openssl-dev \
  && wget -O SoftHSMv2.tar.gz \
  https://github.com/opendnssec/SoftHSMv2/archive/${SOFTHSMV2_VERSION}.tar.gz \
  && tar -xf SoftHSMv2.tar.gz \
  && cd SoftHSMv2-${SOFTHSMV2_VERSION} \
  && ./autogen.sh \
  && ./configure --disable-gost --enable-eddsa \
  && make \
  && make install

FROM alpine:3.15 AS prod

LABEL maintainer="Carlos Remuzzi carlosremuzzi@gmail.com"
LABEL org.label-schema.description="yet another SoftHSMv2 dockerization"
LABEL org.label-schema.name="SoftHSMv2 "
LABEL org.label-schema.schema-version="1.0"
LABEL org.label-schema.vendor="CGRemuzzi"

ENV SOFTHSM2_CONF=/home/softhsm/softhsm2.conf

RUN apk add --no-cache \
  libstdc++ \
  musl \
  opensc \
  openssl \
  && adduser -u 10001 -D softhsm \
  && mkdir /tokens \
  && chown -R softhsm:softhsm /tokens

WORKDIR /app

COPY --chown=softhsm:softhsm softhsm2.conf /home/softhsm/softhsm2.conf
COPY --from=build /usr/local/lib/softhsm /usr/local/lib/softhsm
COPY --from=build /usr/local/bin/* /usr/local/bin/

RUN apk --no-cache add build-base
RUN apk add --no-cache python3
RUN apk add --no-cache python2 g++
RUN apk add --update nodejs-current npm
RUN apk add --no-cache su-exec

COPY ./src ./src
COPY ./env ./env
COPY package*.json ./
COPY tsconfig.json ./

RUN npm run initToken
RUN npm install \
  && npm run build

USER root

EXPOSE 5000
# CMD npm run start
CMD ["npm", "run", "start:dev"]
