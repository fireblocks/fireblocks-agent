import customerServerclient from './customer-server-client';
import * as fbAgentCli from './fb-agent-cli';

fbAgentCli.start();
customerServerclient.pullMessagesStatus();
