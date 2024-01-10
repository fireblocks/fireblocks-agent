import { Collection, MongoClient } from 'mongodb';
import logger from '../services/logger';
import { GUID, Message, MessageEnvelope, MessageStatus } from '../types';
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
    _id: msg.msgId,
    ...msg,
  };
  return msgRef.updateOne({ _id: dbMsg._id }, { $set: dbMsg }, { upsert: true });
};

export const insertMessages = async (messages: MessageEnvelope[]): Promise<MessageStatus[]> => {
  const msgRef = await getMessagesCollection();
  const dbMsgs = messages.map(({ msgId, type, message, payload }: MessageEnvelope) => {
    return {
      _id: msgId,
      msgId,
      requestId: message.requestId,
      type,
      message,
      payload,
      status: 'PENDING_SIGN',
    } as DbMsg;
  });
  const insertRes = await msgRef.insertMany(dbMsgs);
  const messagesRes = await getMessagesStatus(Object.values(insertRes.insertedIds));
  return messagesRes;
};

export const getMessagesStatus = async (msgIds: GUID[]): Promise<MessageStatus[]> => {
  logger.info(`entering getMessagesStatus ${JSON.stringify(msgIds)}`);
  const txRef = await getMessagesCollection();
  const cursor = await txRef.find({ _id: { $in: msgIds } });
  const res = await cursor.toArray();
  return toMsgStatus(res);
};

export const getMessages = async (msgIds: GUID[]): Promise<DbMsg[]> => {
  const txRef = await getMessagesCollection();
  const cursor = await txRef.find({ _id: { $in: msgIds } });
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
  _id: GUID;
  message: Message;
}
