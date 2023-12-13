import { Collection, MongoClient } from 'mongodb';
import { GUID, MessageStatus } from '../types';
import { getMongoUri } from './mongo.connect';

let _msgRef: Collection<DbMsgStatus>;
const getMessagesCollection = async () => {
  if (_msgRef) {
    return _msgRef;
  }
  const uri = await getMongoUri();
  const client = new MongoClient(uri);
  const database = client.db('customer-server-db');
  _msgRef = database.collection<DbMsgStatus>('messages');
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

export const insertMessages = async (messages: MessageStatus[]) => {
  const msgRef = await getMessagesCollection();
  const dbMsgs = messages.map((msgStatus) => {
    return {
      _id: msgStatus.msgId,
      ...msgStatus,
    };
  });
  return msgRef.insertMany(dbMsgs);
};

export const getMessagesStatus = async (msgIds: GUID[]): Promise<MessageStatus[]> => {
  const txRef = await getMessagesCollection();
  const cursor = await txRef.find({ _id: { $in: msgIds } });
  const res: Partial<DbMsgStatus>[] = await cursor.toArray();
  return toMsgStatus(res);
};

function toMsgStatus(dbMsgs: Partial<DbMsgStatus>[]): MessageStatus[] {
  dbMsgs.forEach((_) => delete _._id);
  return dbMsgs as MessageStatus[];
}

interface DbMsgStatus extends MessageStatus {
  _id: GUID;
}
