import { Collection, MongoClient } from 'mongodb';
import logger from '../services/logger';
import { Message, MessageEnvelope, MessageStatus } from '../types';
import { getMongoUri } from './mongo.connect';

let _msgRef: Collection<DbMsg>;
const getMessagesCollection = async () => {
  if (_msgRef) {
    return _msgRef;
  }
  const uri = await getMongoUri();
  const client = new MongoClient(uri);
  const database = client.db('customer-server-db');
  _msgRef = database.collection<DbMsg>('messages');
  return _msgRef;
};

export const updateMessageStatus = async (msg: MessageStatus) => {
  const msgRef = await getMessagesCollection();
  const dbMsg = {
    _id: msg.requestId,
    ...msg,
  };
  return msgRef.updateOne({ _id: dbMsg._id }, { $set: dbMsg }, { upsert: true });
};

export const insertMessages = async (messages: MessageEnvelope[]): Promise<MessageStatus[]> => {
  const msgRef = await getMessagesCollection();
  const dbMsgs = messages.map(({ msgId, requestId, type, message, payload }: MessageEnvelope) => {
    return {
      _id: requestId,
      msgId,
      requestId: message.requestId,
      type,
      message,
      payload,
      status: 'PENDING_SIGN',
    } as DbMsg;
  });

  const bulkOperations = dbMsgs.map((dbMsg) => ({
    updateOne: {
      filter: { _id: dbMsg._id },
      update: {
        $set: dbMsg,
      },
      upsert: true,
    },
  }));

  const bulkRes = await msgRef.bulkWrite(bulkOperations);
  const { insertedIds, upsertedIds } = bulkRes;
  const messagesRes = await getMessagesStatus([...Object.values(insertedIds), ...Object.values(upsertedIds)]);
  return messagesRes;
};

export const getMessagesStatus = async (requestIds: string[]): Promise<MessageStatus[]> => {
  logger.info(`entering getMessagesStatus ${JSON.stringify(requestIds)}`);
  const txRef = await getMessagesCollection();
  const cursor = await txRef.find({ _id: { $in: requestIds } });
  const res = await cursor.toArray();
  return toMsgStatus(res);
};

export const getMessages = async (requestsIds: string[]): Promise<DbMsg[]> => {
  const txRef = await getMessagesCollection();
  const cursor = await txRef.find({ _id: { $in: requestsIds } });
  const res = await cursor.toArray();
  return res;
};

function toMsgStatus(dbMsgs: Partial<DbMsg>[]): MessageStatus[] {
  dbMsgs.forEach((_) => {
    delete _._id;
    delete _.message;
  });
  return dbMsgs as MessageStatus[];
}

interface DbMsg extends MessageStatus {
  _id: string;
  message: Message;
}
