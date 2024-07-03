import { ExtendedMessageStatusCache } from 'types';
import { CUSTOMER_SERVER_PULL_CADENCE_MS } from './constants';
import customerServerApi from './services/customer-server.api';
import logger from './services/logger';
import messagesService from './services/messages.service';
class CustomerClient {
  pullMessagesStatus = async () => {
    try {
      const messages = messagesService.getPendingMessages() ?? [];
      const requestsIds = messages.map((msg) => msg.messageStatus.requestId);
      logger.info(`Pulling messages status for ${JSON.stringify(requestsIds)} from customer server`);
      const { statuses: serverStatuses } = await customerServerApi.messagesStatus({ requestsIds });
      logger.info(`Got ${messages.length} statuses from Customer server`);
      if (!!serverStatuses.length) {
        logger.info(`Got messages status for ${JSON.stringify(serverStatuses.map((status) => { return { requestId: status.requestId, status: status.status } }))}`);

        await messagesService.updateStatus(serverStatuses.map((messagesStatus): ExtendedMessageStatusCache => {
          const decodedMsg = messages.find((msg) => msg.messageStatus.requestId === messagesStatus.requestId);
          return {
            msgId: decodedMsg.msgId,
            request: decodedMsg.request,
            messageStatus: messagesStatus,
          };
        }));
      }
    } catch (e) {
      logger.error(`Got error from customer server: "${e.message}"`);
    }
    setTimeout(this.pullMessagesStatus, CUSTOMER_SERVER_PULL_CADENCE_MS);
  };
}

export default new CustomerClient();
