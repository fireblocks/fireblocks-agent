import messagesService from 'services/messages.service';
import customerServerApi from './services/customerServer.api';

class CustomerClient {
  private HALF_A_MINUTE = 30 * 1000;

  constructor() {}

  start = async () => {
    const msgIds = messagesService.getPendingMessages();
    const status = await customerServerApi.messagesStatus({ msgIds });
    messagesService.updateStatus(status);

    setInterval(this.start, this.HALF_A_MINUTE);
  };
}

export default new CustomerClient();
