import { Request, Response, Router } from 'express';
import { paths } from '../customer-server';
import * as messagesDao from '../dao/messages.dao';
import * as hsmSignService from '../services/hsm-sign-service';
import { MessageStatus } from '../types';
const msgRouter = Router();

msgRouter.post('/messagesToSign', async (req: Request<{}, {}, MessagesRequest>, res: Response<MessagesResponse>) => {
  const { messages } = req.body;
  const messagesStatus: MessageStatus[] = await messagesDao.insertMessages(messages);

  //the next line we simulate the hsm work and sign the messages.
  const msgIds = messagesStatus.map((_) => _.request.transportMetadata.internalMessageId);
  await hsmSignService.signMessages(msgIds);
  const messagesStatusAfterSign = await messagesDao.getMessagesStatus(msgIds);

  res.status(200).json({ statuses: messagesStatusAfterSign });
});

msgRouter.post(
  '/messagesStatus',
  async (req: Request<{}, {}, MessagesStatusRequest>, res: Response<MessagesStatusResponse>) => {
    const { msgIds } = req.body;
    const messagesStatus = await messagesDao.getMessagesStatus(msgIds);
    res.status(200).json({ statuses: messagesStatus });
  },
);

export default msgRouter;

type MessagesResponse = paths['/messagesToSign']['post']['responses'][200]['content']['application/json'];
type MessagesRequest = paths['/messagesToSign']['post']['requestBody']['content']['application/json'];

type MessagesStatusResponse = paths['/messagesStatus']['post']['responses'][200]['content']['application/json'];
type MessagesStatusRequest = paths['/messagesStatus']['post']['requestBody']['content']['application/json'];
