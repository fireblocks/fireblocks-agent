import { ExtendedMessageStatusCache } from 'types';
import { CUSTOMER_SERVER_PULL_CADENCE_MS } from './constants';
import customerServerApi from './services/customer-server.api';
import logger from './services/logger';
import messagesService from './services/messages.service';
import { http } from 'winston';
import https from 'https';

class CustomerClient {
  pullMessagesStatus = async (httpsAgent: https.Agent) => {
    try {
      const messages = messagesService.getPendingMessages() ?? [];
      const requestsIds = messages.map((msg) => msg.messageStatus.requestId);
      logger.info(`Pulling messages status for ${JSON.stringify(requestsIds)} from customer server`);
      const { statuses: serverStatuses } = await customerServerApi.messagesStatus({ requestsIds }, httpsAgent);
      logger.info(`Got ${messages.length} statuses from Customer server`);
      if (!!serverStatuses.length) {
        logger.info(
          `Got from customer server messages status for ${JSON.stringify(
            serverStatuses.map((status) => {
              return { requestId: status.requestId, status: status.status };
            }),
          )}`,
        );

        await messagesService.updateStatus(
          serverStatuses
            .map((messagesStatus): ExtendedMessageStatusCache => {
              const decodedMsg = messages.find((msg) => msg.messageStatus.requestId === messagesStatus.requestId);
              if (!decodedMsg) {
                logger.error(`Message with requestId ${messagesStatus.requestId} not in pending cache messages`);
                return null;
              }
              return {
                msgId: decodedMsg.msgId,
                request: decodedMsg.request,
                messageStatus: messagesStatus,
              };
            })
            .filter((msg) => msg !== null),
        );
      }
    } catch (e) {
      logger.error(`Got error from customer server: "${e.message}"`);
    }
    setTimeout(() => {
      this.pullMessagesStatus(httpsAgent);
    }, CUSTOMER_SERVER_PULL_CADENCE_MS);
  };
}

export default new CustomerClient();
