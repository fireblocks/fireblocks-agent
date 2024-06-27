import { CUSTOMER_SERVER_PULL_CADENCE } from './constants';
import customerServerApi from './services/customer-server.api';
import logger from './services/logger';
import messagesService from './services/messages.service';
class CustomerClient {
  pullMessagesStatus = async () => {
    try {
      const statuses = messagesService.getPendingMessages();
      const requestsIds = statuses.map((status) => status.messageStatus.requestId);
      if (!!requestsIds.length) {
        const { statuses: serverStatuses } = await customerServerApi.messagesStatus({ requestsIds });
        await messagesService.updateStatus(serverStatuses.map((messageStatus) => ({
          msgId: statuses.find((status) => status.messageStatus.requestId === messageStatus.requestId).msgId,
          messageStatus,
        })));
      }
    } catch (e) {
      logger.error(`Got error from customer server ${e.message}`);
    }
    setTimeout(this.pullMessagesStatus, CUSTOMER_SERVER_PULL_CADENCE);
  };
}

export default new CustomerClient();
