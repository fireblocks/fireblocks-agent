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

export default msgRouter;

type MessagesResponse =
  paths['/messagesToSign']['post']['responses'][200]['content']['application/json'];
type MessagesRequest =
  paths['/messagesToSign']['post']['requestBody']['content']['application/json'];

type MessagesStatusResponse =
  paths['/messagesStatus']['post']['responses'][200]['content']['application/json'];
type MessagesStatusRequest =
  paths['/messagesStatus']['post']['requestBody']['content']['application/json'];
