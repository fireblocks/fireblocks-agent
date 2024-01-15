import customerServerApi from './services/customerServer.api';
import logger from './services/logger';
import messagesService from './services/messages.service';

class CustomerClient {
  private HALF_A_MINUTE = 30 * 1000;

  pullMessagesStatus = async () => {
    try {
      const msgIds = messagesService.getPendingMessages();
      const status = await customerServerApi.messagesStatus({ msgIds });
      await messagesService.updateStatus(status.messages);
    } catch (e) {
      logger.error(`Got error from customer server ${e.message}`);
    }
    setTimeout(this.pullMessagesStatus, this.HALF_A_MINUTE);
  };
}

export default new CustomerClient();
