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
    const responseType = REQUEST_TYPE_TO_RESPONSE_TYPE.get(parsedPayload.type);
    if (!responseType) {
      throw new Error(`Unknown request type ${parsedPayload.type}`);
    }

    const msgStatus: MessageStatus = {
      type: responseType,
      status: 'PENDING_SIGN',
      requestId: transportMetadata.requestId,
      response: {},
    };

    return {
      _id: transportMetadata.requestId,
      message: parsedPayload,
      ...msgStatus,
    } as DbMsg;
  });

  // Adding new messages to the DB
  const bulkOperations = dbMsgs.map((msg) => ({
    updateOne: {
      filter: { _id: msg._id },
      update: {
        $setOnInsert: msg,
      },
      upsert: true,
    },
  }))
  logger.info(`insertMessages: writing ${bulkOperations.length} messages to DB`);
  const result = await msgRef.bulkWrite(bulkOperations);
  logger.info(`insertMessages: found ${result.upsertedCount} new messages and ${result.matchedCount} old messages in DB`);
  let newMessages = dbMsgs.filter((e, i) => Object.keys(result.upsertedIds).includes(String(i)))
  return toMsgStatus(newMessages);
};

export const getMessagesStatus = async (requestsIds: string[]): Promise<MessageStatus[]> => {
  logger.info(`entering getMessagesStatus. Got request for ${requestsIds.length} messages`);
  const txRef = await getMessagesCollection();

  const stats = await txRef.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        pendingSign: { $sum: { $cond: [{ $eq: ["$status", "PENDING_SIGN"] }, 1, 0] } },
        signed: { $sum: { $cond: [{ $eq: ["$status", "SIGNED"] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ["$status", "FAILED"] }, 1, 0] } },
      },
    },
  ]).toArray();
  
  if (stats.length > 0) {
    const { total, pendingSign, signed, failed } = stats[0];
    logger.info(`Full DB statistics: TOTAL: ${total}, PENDING_SIGN: ${pendingSign}, SIGNED: ${signed}, FAILED: ${failed}`);
  } else {
    logger.warning(`Could not read full DB statistics`);
  }
  
  const res = await txRef.find({ _id: { $in: requestsIds } }).toArray();
  logger.info(`Results statistics: `+
              `TOTAL: ${res.length}` +
              `, PENDING_SIGN: ${res.filter((_) => _.status === "PENDING_SIGN").length}` +
              `, SIGNED: ${res.filter((_) => _.status === "SIGNED").length}` +
              `, FAILED: ${res.filter((_) => _.status === "FAILED").length}`);
  return toMsgStatus(res);
};

export const getMessages = async (requestsIds: string[]): Promise<DbMsg[]> => {
  const txRef = await getMessagesCollection();
  const cursor = await txRef.find({ _id: { $in: requestsIds } });
  const res = await cursor.toArray();
  return res;
};

export const getAllPendingMessages = async (): Promise<DbMsg[]> => {
  const txRef = await getMessagesCollection();
  const cursor = await txRef.find({ status: "PENDING_SIGN" });
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
