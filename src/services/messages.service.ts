import { AccessToken, Message } from '../types';
import serverApi from './server.api';

const messageService = {
  handleMessage: async ({ msgId }: Message, accessToken: AccessToken) => {
    await serverApi.ackMessage(msgId, accessToken);
  },
};

export default messageService;
