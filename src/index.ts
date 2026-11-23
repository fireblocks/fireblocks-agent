import './constants'; // loads the .env file before the Customer Server settings are read
import customerServerClient from './customer-server-client';
import * as fbAgentCli from './fb-agent-cli';
import logger from './services/logger';
import { CustomerServerTls, CustomerServerTlsError, resolveCustomerServerTls } from './customer-server-tls';

// Process-level safety nets: with fire-and-forget message dispatch a stray rejection or
// throw must be surfaced, never swallowed. Log unhandled rejections and keep running; on an
// uncaught exception the process may be in an undefined state, so log and exit; the Agent is the
// container's main process, so the container stops and its restart policy brings it back.
process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.stack ?? reason.message : String(reason);
  logger.error(`Unhandled promise rejection: ${message}`);
});
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err.stack ?? err.message} - exiting for a restart`);
  process.exit(1);
});

// HTTPS to the Customer Server, unless ALLOW_INSECURE_CUSTOMER_SERVER=true allows http://; see
// customer-server-tls.ts. A wrong setting stops the Agent here, with exit status 2 like the other
// settings errors (constants.ts), before it connects to anything.
let customerServerTls: CustomerServerTls;
try {
  customerServerTls = resolveCustomerServerTls(process.env);
} catch (e) {
  if (!(e instanceof CustomerServerTlsError)) {
    throw e;
  }
  logger.error(e.message);
  console.error(e.message);
  process.exit(2);
}
for (const warning of customerServerTls.warnings) {
  logger.warn(warning);
}

fbAgentCli.start(customerServerTls);
customerServerClient.pullMessagesStatus(customerServerTls.httpsAgent);
