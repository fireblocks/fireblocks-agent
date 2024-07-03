import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { authMiddleware } from './middlewares/authorization.middleware';
import './pre-start';
import apiRouter from './routes/api.router';
import logger from './services/logger';
const PORT = 5000;
const SERVER_START_MSG = `Custom server started on http://localhost:${PORT}`;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

// Show routes called in console during development
if (process.env.NODE_ENV === 'dev') {
  app.use(morgan('dev'));
}
app.use(helmet());

app.use(`/api`, apiRouter);

app.listen(PORT, () => logger.info(SERVER_START_MSG));
