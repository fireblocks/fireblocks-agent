import { Router } from 'express';
import hsmRouter from './hsm.router';
import txRouter from './transactions.router';
const apiRouter = Router();

apiRouter.use(`/api`, txRouter);
apiRouter.use(`/hsm`, hsmRouter);
export default apiRouter;
