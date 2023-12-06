import { Request, Response, Router } from 'express';
import { paths } from '../../../../api/customer-server';
import * as transactionsDao from '../dao/transcations.dao';

const apiRouter = Router();

const txRouter = Router();

txRouter.post(
  '/txToSign',
  async (req: Request<{}, {}, TxRequest>, res: Response<TxResponse>) => {
    const { txId } = req.body;
    await transactionsDao.upsertTransactionStatus({
      txId,
      status: 'PENDING_SIGN',
    });
    res.status(200).json({ txId });
  },
);

txRouter.post(
  '/txStatus',
  async (
    req: Request<{}, {}, TxStatusRequest>,
    res: Response<TxStatusResponse>,
  ) => {
    const { txIds } = req.body;
    const txStatus = await transactionsDao.getTransactionsStatus(txIds);
    res.status(200).json({ transcations: txStatus });
  },
);

apiRouter.use(`/api`, txRouter);
export default apiRouter;

type TxResponse =
  paths['/txToSign']['post']['responses'][200]['content']['application/json'];
type TxRequest =
  paths['/txToSign']['post']['requestBody']['content']['application/json'];

type TxStatusResponse =
  paths['/txStatus']['post']['responses'][200]['content']['application/json'];
type TxStatusRequest =
  paths['/txStatus']['post']['requestBody']['content']['application/json'];
