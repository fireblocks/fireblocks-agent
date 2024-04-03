[![Node.js CI](https://github.com/fireblocks/fireblocks-agent/actions/workflows/node.js.yml/badge.svg)](https://github.com/fireblocks/fireblocks-agent/actions/workflows/node.js.yml)
![Branches](https://github.com/fireblocks/fireblocks-agent/blob/badges/badges/coverage-branches.svg)
![Functions](https://github.com/fireblocks/fireblocks-agent/blob/badges/badges/coverage-functions.svg)
![Lines](https://github.com/fireblocks/fireblocks-agent/blob/badges/badges/coverage-lines.svg)
![Statements](https://github.com/fireblocks/fireblocks-agent/blob/badges/badges/coverage-statements.svg)
![Jest coverage](https://github.com/fireblocks/fireblocks-agent/blob/badges/badges/coverage-jest%20coverage.svg)

# Welcome to Fireblocks Agent

Fireblocks Agent is an open-source on-prem service written in Typescript which is responsible for receiving new messages to sign from Fireblocks, relay these messages to the client's HSM and return the signed result back to Fireblocks.

# Develop (Run Locally)

### Prerequisites

- Make sure you have nvm on your machine. To check, run `nvm` in a terminal.
  - To install `nvm`:
    - On mac run `brew install nvm`
    - Linux, follow these [instructions](https://github.com/nvm-sh/nvm?tab=readme-ov-file#installing-and-updating)

### Installation 

- `git clone https://github.com/fireblocks/fireblocks-agent.git`
- `cd fireblocks-agent`
- `nvm use`
- install dependencies `npm i`

### Running
- Build and run example customer server docker:
  - `cd examples/server`
  - `npm run build:docker`
  - `npm run start:docker`
- Copy `.env.prod` and name it `.env.{env}` for example `.env.dev9`
- Edit your newly created `.env.{env}` file with the right config
- Start fireblocks agent with your desired env i.e `npm run start --env=prod`

### Fireblocks Agent Environment Variables
The fireblocks agent expect a configuration file (for production it's called `.env.prod`) with several parameters:
* `MOBILE_GATEWAY_URL` - In production this value should be `https://mobile-api.fireblocks.io`
* `CUSTOMER_SERVER_URL` - The client's custom server url
* `CUSTOMER_SERVER_PULL_CADENCE` - Cadence of pulling messages status
* `CUSTOMER_SERVER_AUTHORIZATION` - If exists, the fireblocks agent will send its value on the `Authorization` header for each request. The client can use it for authorizing the fireblocks agent or keep track on which agent is calling it


# About the Fireblocks Key Link Workspace

## Actors
The Fireblocks Key Link workspace consists of several components (aka actors). Each with its own responsibilities.

* Console - Fireblocks web console. [Link](https://console.fireblocks.io/v2/)
* Mobile App - Fireblocks mobile app.
* Mobile API Gateway - Fireblocks REST API Server. The firblocks agent communicates with this server in the registration flow and for receiving new messages.
* Developer API - Fireblocks back office server for workspace setup and configuration.
* Fireblocks Agent - An on-prem service written in Typescript which is responsible for receiving new messages to sign from Fireblocks, relay these messages to the client's HSM and return the signed result back to Fireblocks.
* Customer Server - The client's own server which receives messages to sign from the fireblocks agent. Sign them via the client's HSM and provide the fireblocks agent with the signed messages.
* HSM component - The actual HSM implementation. Can be on prem or a cloud based HSM, or a different Key Management System.

## About the Customer Server
The customer server is a component that should be written by the client according to the client's connection to the HSM component. The server is expected to implement the following [OpenAPI spec](api/customer-server.api.yml). 

In general, it should support signing messages according to `ECDSA` and `EdDSA` algorithms and return the status for given messages.

We provide an example of such a server in `examples/server` with an integration to a software implementation of an HSM called [softHSM](https://www.opendnssec.org/softhsm/)

The entry point for the server can be found [here](examples/server/src/server.ts)

## Main Flows

### Create a New Fireblocks Agent API User

![Create a New Fireblocks Agent API User flow](docs/flows/create_api_user_sd.png)

### Pair the Fireblocks Agent Device

![Pair the Fireblocks Agent Device flow](docs/flows/pair_device_sd.png)

### Add a Validator Key
This procedure should happen once. Fireblocks will need a validator key to approve new signing keys. This flow is done via the fireblocks sdk and not via this program.

![Add validator key flow](docs/flows/add_validator_key.png)

### Add Signing Keys
Each signing key should be first converted into a certificate which should be signed by an active validator key. The signed certificates are then regsitered to Fireblocks via the API or the Console. 

![Add signing keys flow](docs/flows/add_signing_keys.png)

### Fireblocks Agent & Customer Server with HSM - Main Flow

![fireblocks agent main logic flow](docs/flows/fireblocks_agent_main_flow.png)