import fs from 'fs';
import https from 'https';
import { SSL_CERT_PATH } from './constants';
import customerServerClient from './customer-server-client';
import * as fbAgentCli from './fb-agent-cli';
import logger from './services/logger';

// Process-level safety nets: with fire-and-forget message dispatch a stray rejection or
// throw must be surfaced, never swallowed. Log unhandled rejections and keep running; on an
// uncaught exception the process may be in an undefined state, so log and exit for the
// supervisor (pm2) to restart cleanly.
process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.stack ?? reason.message : String(reason);
  logger.error(`Unhandled promise rejection: ${message}`);
});
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err.stack ?? err.message} - exiting for supervisor restart`);
  process.exit(1);
});

const self_signed_cert = fs.existsSync(SSL_CERT_PATH) ? fs.readFileSync(SSL_CERT_PATH) : undefined;
const httpsAgent = self_signed_cert ? new https.Agent({ ca: self_signed_cert }) : new https.Agent();

fbAgentCli.start(httpsAgent);
customerServerClient.pullMessagesStatus(httpsAgent);
