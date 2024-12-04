import { Request, Response, Router } from 'express';
import { paths } from '../customer-server';
import * as messagesDao from '../dao/messages.dao';
import * as hsmSignService from '../services/hsm-sign-service';
import logger from '../services/logger';
import { MessageStatus } from '../types';
const msgRouter = Router();

msgRouter.post('/messagesToSign', async (req: Request<{}, {}, MessagesRequest>, res: Response<MessagesResponse>) => {
  const { messages } = req.body;
  logger.info(`received ${messages.length} messages to sign`);
  const messagesStatus: MessageStatus[] = await messagesDao.insertMessages(messages);

  //the next line we simulate the hsm work and sign the messages immediately if HSM_MODE is HOT, otherwise don't sign just save message in DB.
  const requestsIds = messagesStatus.map((_) => _.requestId);
  const hsmMode = process.env.HSM_MODE || "HOT"
  const isHotMode = hsmMode === "COLD" ? false : true;
  logger.info(`HSM mode is ${isHotMode ? "HOT" : "COLD"}`)
  if (isHotMode) {
    await hsmSignService.signMessages(requestsIds);
  }

  const messagesStatusAfterSign = await messagesDao.getMessagesStatus(messages.map((_) => _.transportMetadata.requestId));

  res.status(200).json({ statuses: messagesStatusAfterSign });
});

msgRouter.post('/signAllPendingMessages',
  async (req: Request<{}, {}, MessagesStatusRequest>, res: Response<MessagesStatusResponse>) => {
    const messagesStatus = await messagesDao.getAllPendingMessages();
    const requestsIds = messagesStatus.map((_) => _.requestId);
    logger.info(`found ${requestsIds.length} pending messages ${JSON.stringify(requestsIds)}`);
    const signingOrder = process.env.SIGNING_ORDER || "NORMAL"
    if (signingOrder === "RANDOM") {
      // randomize requestsIds
      requestsIds.sort(() => Math.random() - 0.5);
      logger.info(`have ${requestsIds.length} pending messages after random: ${JSON.stringify(requestsIds)}`);
    }
    await hsmSignService.signMessages(requestsIds);
    const messagesStatusAfterSign = await messagesDao.getMessagesStatus(requestsIds);

    res.status(200).json({ statuses: messagesStatusAfterSign });
  },
);

msgRouter.post('/signRequest/:requestId',
  async (req: Request<{ requestId: string }, {}, MessagesStatusRequest>, res: Response<MessagesStatusResponse>) => {
    const { requestId } = req.params;
    await hsmSignService.signMessages([requestId]);
    const messagesStatusAfterSign = await messagesDao.getMessagesStatus([requestId]);

    res.status(200).json({ statuses: messagesStatusAfterSign });
  },
);


msgRouter.post(
  '/messagesStatus',
  async (req: Request<{}, {}, MessagesStatusRequest>, res: Response<MessagesStatusResponse>) => {
    const { requestsIds } = req.body;
    const messagesStatus = await messagesDao.getMessagesStatus(requestsIds);
    res.status(200).json({ statuses: messagesStatus });
  },
);

export default msgRouter;

type MessagesResponse = paths['/messagesToSign']['post']['responses'][200]['content']['application/json'];
type MessagesRequest = paths['/messagesToSign']['post']['requestBody']['content']['application/json'];

type MessagesStatusResponse = paths['/messagesStatus']['post']['responses'][200]['content']['application/json'];
type MessagesStatusRequest = paths['/messagesStatus']['post']['requestBody']['content']['application/json'];
