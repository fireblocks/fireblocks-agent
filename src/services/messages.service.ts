import jwt from 'jsonwebtoken';
import { Message, MessageEnvlope, TxType } from '../types';
import customerServerApi from './customerServer.api';

const messageService = {
  handleMessage: async ({ msgId, msg }: MessageEnvlope) => {
    const message = jwt.decode(msg) as Message;
    if (message.type !== TxType.MPC_START_SIGNING) {
      return;
    }
    await customerServerApi.txToSign(message);
  },
};

export default messageService;
