import customerServerApi from './services/customerServer.api';
import messagesService from './services/messages.service';

class CustomerClient {
  private HALF_A_MINUTE = 30 * 1000;

  constructor() {}

  pullMessagesStatus = async () => {
    const msgIds = messagesService.getPendingMessages();
    const status = await customerServerApi.messagesStatus({ msgIds });
    messagesService.updateStatus(status.messages);

    setTimeout(this.pullMessagesStatus, this.HALF_A_MINUTE);
  };
}

export default new CustomerClient();
