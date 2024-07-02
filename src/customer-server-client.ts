import { ExtendedMessageStatusCache } from 'types';
import { CUSTOMER_SERVER_PULL_CADENCE } from './constants';
import customerServerApi from './services/customer-server.api';
import logger from './services/logger';
import messagesService from './services/messages.service';
class CustomerClient {
  pullMessagesStatus = async () => {
    try {
      const messages = messagesService.getPendingMessages();
      if (!!messages.length) {
        const requestsIds = messages.map((msg) => msg.messageStatus.requestId);
        logger.info(`Pulling messages status for ${JSON.stringify(requestsIds)}`);
        const { statuses: serverStatuses } = await customerServerApi.messagesStatus({ requestsIds });
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
      }
    } catch (e) {
      logger.error(`Got error from customer server ${e.message}`);
    }
    setTimeout(this.pullMessagesStatus, CUSTOMER_SERVER_PULL_CADENCE);
  };
}

export default new CustomerClient();
