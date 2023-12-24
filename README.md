# 🚀 Welcome to Fireblocks HSM Agent

# Running locally

### Preconditions

- Make sure you have nvm on your machine. To check run `nvm` in a terminal.
  - To install `nvm`:
    - On mac run `brew isntall nvm`
    - Linux, follow these [instructions](https://github.com/nvm-sh/nvm?tab=readme-ov-file#installing-and-updating)

### Installation 

- `git clone git@gitlab.com:fireblocks/shell/common/hsm-agent.git`
- `cd hsm-agent`
- `nvm use`
- install dependencies `npm i`

### Running
- Build and run example customer server docker `npm run start:example-server`
- Copy `.env.prod` and name it `.env.{env}` for example `.env.dev9`
- Edit your newly created `.env.{env}` file with the right config
- Start hsm agent with your desired env i.e `npm run start --env=dev9`

