import customerServerClient from './customer-server-client';
import * as fbAgentCli from './fb-agent-cli';
import fs from 'fs';
import { SSL_CERT_PATH } from './constants';
import https from 'https';

const self_signed_cert = fs.readFileSync(SSL_CERT_PATH) ?? undefined;
const httpsAgent = self_signed_cert ? new https.Agent({ca: self_signed_cert}) : new https.Agent();

fbAgentCli.start(httpsAgent);
customerServerClient.pullMessagesStatus(httpsAgent);
