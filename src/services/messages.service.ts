import { FBMessageEnvlope, GUID, MessageEnvelop, MessageStatus, TxType } from '../types';
import { decodeAndVerifyMessage } from '../utils/messages-utils';
import customerServerApi from './customerServer.api';
import serverApi from './server.api';

class MessageService {
  private msgCache: { [msgId: GUID]: MessageStatus };

  constructor() {
    this.msgCache = {};
  }

  getPendingMessages(): GUID[] {
    return Object.keys(this.msgCache);
  }

  async handleMessages(messages: FBMessageEnvlope[]) {
    const certificates = await serverApi.getCertificates();
    const decodedMessages: MessageEnvelop[] = messages
      .filter(({ msg }) => typeof msg === 'string')
      .map((messageEnvelope: FBMessageEnvlope) => {
        const message = decodeAndVerifyMessage(messageEnvelope, certificates);
        return { message, msgId: messageEnvelope.msgId };
      })
      .filter((_) => _.message.type === TxType.MPC_START_SIGNING);

    if (decodedMessages.length > 0) {
      const status = await customerServerApi.messagesToSign(decodedMessages);
      status.forEach((messageStatus) => {
        this.msgCache[messageStatus.msgId] = messageStatus;
      });
    }
  }

  async updateStatus(messagesStatus: MessageStatus[]) {
    for (const _ of messagesStatus) {
      if (_.status === 'SIGNED') {
        await serverApi.ackMessage(_.msgId);
      }
    }
  }

  _clearCache() {
    this.msgCache = {};
  }
}

export default new MessageService();
