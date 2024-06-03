import { Collection, MongoClient } from 'mongodb';
import logger from '../services/logger';
import { MessageEnvelope, MessagePayload, MessageStatus, RequestType, ResponseType } from '../types';
import { getMongoUri } from './mongo.connect';

const REQUEST_TYPE_TO_RESPONSE_TYPE = new Map<RequestType, ResponseType>([
  ['EXTERNAL_KEY_PROOF_OF_OWNERSHIP_REQUEST', 'EXTERNAL_KEY_PROOF_OF_OWNERSHIP_RESPONSE'],
  ['KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST', 'KEY_LINK_PROOF_OF_OWNERSHIP_RESPONSE'],
]);

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
    _id: msg.request.transportMetadata.msgId,
    ...msg,
  };
  return msgRef.updateOne({ _id: dbMsg._id }, { $set: dbMsg }, { upsert: true });
};

export const insertMessages = async (messages: MessageEnvelope[]): Promise<MessageStatus[]> => {
  const msgRef = await getMessagesCollection();
  const dbMsgs = messages.map(({ message, transportMetadata }: MessageEnvelope) => {
    const { payload } = message;
    const parsedPayload = JSON.parse(payload) as MessagePayload;
    const newType = REQUEST_TYPE_TO_RESPONSE_TYPE.get(parsedPayload.type);
    return {
      _id: transportMetadata.msgId,
      type: newType,
      status: 'PENDING_SIGN',
      message: parsedPayload,
      request: { message, transportMetadata },
    } as DbMsg;
  });
  const insertRes = await msgRef.insertMany(dbMsgs);
  const messagesRes = await getMessagesStatus(Object.values(insertRes.insertedIds));
  return messagesRes;
};

export const getMessagesStatus = async (msgIds: number[]): Promise<MessageStatus[]> => {
  logger.info(`entering getMessagesStatus ${JSON.stringify(msgIds)}`);
  const txRef = await getMessagesCollection();
  const cursor = await txRef.find({ _id: { $in: msgIds } });
  const res = await cursor.toArray();
  return toMsgStatus(res);
};

export const getMessages = async (msgIds: number[]): Promise<DbMsg[]> => {
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
  _id: number;
  message: MessagePayload;
}
