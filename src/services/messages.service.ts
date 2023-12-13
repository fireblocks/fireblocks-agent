import jwt from 'jsonwebtoken';
import { FBMessageEnvlope, GUID, Message, MessageEnvelop, MessageStatus, TxType } from '../types';
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
    const decodedMessages: MessageEnvelop[] = messages
      .map(({ msgId, msg }: FBMessageEnvlope) => {
        const message = jwt.decode(msg) as Message;
        return { message, msgId };
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
