import { Router } from 'express';
import hsmRouter from './hsm.router';
import msgRouter from './messages.router';
const apiRouter = Router();

apiRouter.use(`/api`, msgRouter);
apiRouter.use(`/hsm`, hsmRouter); //for dev purposes only. This router is not part of the openAPI contract between hsm-client and customer server
export default apiRouter;
