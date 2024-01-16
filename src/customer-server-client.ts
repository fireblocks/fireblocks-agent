import { CUSTOMER_SERVER_PULL_CADENCE } from './constants';
import customerServerApi from './services/customerServer.api';
import logger from './services/logger';
import messagesService from './services/messages.service';
class CustomerClient {
  pullMessagesStatus = async () => {
    try {
      const msgIds = messagesService.getPendingMessages();
      const status = await customerServerApi.messagesStatus({ msgIds });
      await messagesService.updateStatus(status.messages);
    } catch (e) {
      logger.error(`Got error from customer server ${e.message}`);
    }
    setTimeout(this.pullMessagesStatus, CUSTOMER_SERVER_PULL_CADENCE);
  };
}

export default new CustomerClient();
