import customerServerclient from './customer-server-client';
import * as hsmClient from './hsm-client';

hsmClient.start();
customerServerclient.pullMessagesStatus();
