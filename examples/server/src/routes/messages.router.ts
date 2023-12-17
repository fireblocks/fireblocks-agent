import { Request, Response, Router } from 'express';
import { paths } from '../customer-server';
import * as transactionsDao from '../dao/messages.dao';
import { MessageStatus } from '../types';

const msgRouter = Router();

msgRouter.post(
  '/messagesToSign',
  async (req: Request<{}, {}, MessagesRequest>, res: Response<MessagesResponse>) => {
    const { messages } = req.body;
    const messagesStatus: MessageStatus[] = messages.map((msg) => {
      return {
        msgId: msg.msgId,
        txId: msg.message.txId,
        status: 'PENDING_SIGN',
      };
    });
    await transactionsDao.insertMessages(messagesStatus);
    randomlySignOrFailMessagesAsync(messagesStatus);
    res.status(200).json({ messages: messagesStatus });
  },
);

msgRouter.post(
  '/messagesStatus',
  async (req: Request<{}, {}, MessagesStatusRequest>, res: Response<MessagesStatusResponse>) => {
    const { msgIds } = req.body;
    const messagesStatus = await transactionsDao.getMessagesStatus(msgIds);
    res.status(200).json({ messages: messagesStatus });
  },
);

function randomlySignOrFailMessagesAsync(messages: MessageStatus[]) {
  messages.forEach((msg) => {
    const oneToFiveSeconds = Math.ceil(Math.random() * 5) * 1000;
    setTimeout(async () => {
      const previousStatus = msg.status;
      msg.status = Math.round(Math.random()) ? 'FAILED' : 'SIGNED';
      if (msg.status === 'FAILED') {
        msg.errorMessage = `Simulate error while signing this message`;
      }
      await transactionsDao.updateMessageStatus(msg);
      console.log(`Set ${msg.msgId} from status ${previousStatus} to ${msg.status}`);
    }, oneToFiveSeconds);
  });
}

export default msgRouter;

type MessagesResponse =
  paths['/messagesToSign']['post']['responses'][200]['content']['application/json'];
type MessagesRequest =
  paths['/messagesToSign']['post']['requestBody']['content']['application/json'];

type MessagesStatusResponse =
  paths['/messagesStatus']['post']['responses'][200]['content']['application/json'];
type MessagesStatusRequest =
  paths['/messagesStatus']['post']['requestBody']['content']['application/json'];
