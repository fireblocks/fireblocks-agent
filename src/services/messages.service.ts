import jwt from 'jsonwebtoken';
import customerServerClient from '../customer-server-client';
import { Message, MessageEnvlope, TxType } from '../types';

const messageService = {
  handleMessage: async ({ msgId, msg }: MessageEnvlope) => {
    const message = jwt.decode(msg) as Message;
    if (message.type !== TxType.MPC_START_SIGNING) {
      return;
    }
    customerServerClient.addTxToSign([message]);
  },
};

export default messageService;
