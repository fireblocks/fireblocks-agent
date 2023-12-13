import { Router } from 'express';
import hsmRouter from './hsm.router';
import msgRouter from './messages.router';
const apiRouter = Router();

apiRouter.use(`/api`, msgRouter);
apiRouter.use(`/hsm`, hsmRouter);
export default apiRouter;
