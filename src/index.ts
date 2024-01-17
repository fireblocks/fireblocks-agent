import customerServerclient from './customer-server-client';
import * as hsmClient from './fb-agent-cli';

hsmClient.start();
customerServerclient.pullMessagesStatus();
