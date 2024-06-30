import { Collection, MongoClient } from 'mongodb';
import logger from '../services/logger';
import { MessageEnvelope, MessagePayload, MessageStatus, RequestType, ResponseType } from '../types';
import { getMongoUri } from './mongo.connect';

const REQUEST_TYPE_TO_RESPONSE_TYPE = new Map<RequestType, ResponseType>([
  ['KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST', 'KEY_LINK_PROOF_OF_OWNERSHIP_RESPONSE'],
  ['KEY_LINK_TX_SIGN_REQUEST', 'KEY_LINK_TX_SIGN_RESPONSE'],
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
    _id: msg.requestId,
    ...msg,
  };
  return msgRef.updateOne({ _id: dbMsg._id }, { $set: dbMsg }, { upsert: true });
};

export const insertMessages = async (messages: MessageEnvelope[]): Promise<MessageStatus[]> => {
  logger.info(`entering insertMessages ${JSON.stringify(messages.map((_) => _.transportMetadata.requestId))}`);
  const msgRef = await getMessagesCollection();
  const dbMsgs = messages.map(({ message, transportMetadata }: MessageEnvelope) => {
    const { payload } = message;
    const parsedPayload = JSON.parse(payload) as MessagePayload;
    const newType = REQUEST_TYPE_TO_RESPONSE_TYPE.get(parsedPayload.type);
    if (!newType) {
      throw new Error(`Unknown request type ${parsedPayload.type}`);
    }

    return {
      _id: transportMetadata.requestId,
      type: newType,
      status: 'PENDING_SIGN',
      requestId: transportMetadata.requestId,
      message: parsedPayload,
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

  await msgRef.bulkWrite(bulkOperations);
  const messagesRes = await getMessagesStatus(dbMsgs.map((dbMsg) => dbMsg._id));
  return messagesRes;
};

export const getMessagesStatus = async (requestsIds: string[]): Promise<MessageStatus[]> => {
  logger.info(`entering getMessagesStatus ${JSON.stringify(requestsIds)}`);
  const txRef = await getMessagesCollection();
  const cursor = await txRef.find({ _id: { $in: requestsIds } });
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
  message: MessagePayload;
}
