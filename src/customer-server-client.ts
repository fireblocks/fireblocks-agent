import { components } from '../api/customer-server';
import customerServerApi from './services/customerServer.api';
import { GUID, Message } from './types';

class CustomerClient {
  private HALF_A_MINUTE = 30 * 1000;
  private txCache: { [txId: GUID]: TxCacheEntry };

  constructor() {
    this.txCache = {};
  }

  startPullMessagesLoop = async () => {
    const txIds = Object.keys(this.txCache).filter(
      (txId) => this.txCache[txId].txStatus.status === 'PENDING_SIGN',
    );
    const status = await customerServerApi.txStatus({ txIds });
    setInterval(this.startPullMessagesLoop, this.HALF_A_MINUTE);
  };

  addTxToSign = async (transactions: Message[]) => {
    for (const tx of transactions) {
      await customerServerApi.txToSign(tx);
      this.txCache[tx.txId] = {
        tx,
        txStatus: { txId: tx.txId, status: 'PENDING_SIGN' },
      };
    }
  };
}

interface TxCacheEntry {
  txStatus: TxStatus;
  tx: Message;
}

export type TxStatus = components['schemas']['TxStatus'];

export default new CustomerClient();
