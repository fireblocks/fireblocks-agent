import { Collection, MongoClient } from 'mongodb';
import { GUID, TxStatus } from '../types';
import { getMongoUri } from './mongo.connect';

let _txRef: Collection<DbTxStatus>;
const getTransactionsCollection = async () => {
  if (_txRef) {
    return _txRef;
  }
  const uri = await getMongoUri();
  const client = new MongoClient(uri);
  const database = client.db('customer-server-db');
  _txRef = database.collection<DbTxStatus>('transactions');
  return _txRef;
};

export const upsertTransactionStatus = async (tx: TxStatus) => {
  const txRef = await getTransactionsCollection();
  const dbTx = {
    _id: tx.txId,
    ...tx,
  };
  return txRef.updateOne({ _id: dbTx._id }, { $set: dbTx }, { upsert: true });
};

export const getTransactionsStatus = async (txIds: GUID[]): Promise<TxStatus[]> => {
  const txRef = await getTransactionsCollection();
  const cursor = await txRef.find({ _id: { $in: txIds } });
  const res: Partial<DbTxStatus>[] = await cursor.toArray();
  return toTxStatus(res);
};

function toTxStatus(dbTxs: Partial<DbTxStatus>[]): TxStatus[] {
  dbTxs.forEach((_) => delete _._id);
  return dbTxs as TxStatus[];
}

interface DbTxStatus extends TxStatus {
  _id: GUID;
}
