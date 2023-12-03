import { Request, Response, Router } from 'express';
import { paths } from '../../../../api/custom-server';

const apiRouter = Router();

const txRouter = Router();

type TxResponse =
  paths['/txToSign']['post']['responses'][200]['content']['application/json'];
type TxRequest =
  paths['/txToSign']['post']['requestBody']['content']['application/json'];

txRouter.post(
  '/txToSign',
  (req: Request<{}, {}, TxRequest>, res: Response<TxResponse>) => {
    const { txId } = req.body;
    res.status(200).json({ txId });
  },
);

apiRouter.use(`/api`, txRouter);

export default apiRouter;
