import express from 'express';
import fs from 'fs';
import helmet from 'helmet';
import https from 'https';
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

// Use HTTPS if private key and certificate are provided
const ssl_priv_key_path = process.env.SELF_SIGNED_SSL_PRIV_KEY_PATH ?? '';
const ssl_cert_path = process.env.SELF_SIGNED_SSL_CERT_PATH ?? '';
if (fs.existsSync(ssl_priv_key_path) && fs.existsSync(ssl_cert_path)) {
  logger.info(`Found private key and SSL certificate - Using HTTPS`);
  const sslOptions = {
    key: fs.readFileSync(ssl_priv_key_path),
    cert: fs.readFileSync(ssl_cert_path),
  };
  https.createServer(sslOptions, app).listen(PORT, () => logger.info(SERVER_START_MSG));
}
else {
  logger.info(`Could not find private key ${ssl_priv_key_path} or SSL certificate ${ssl_cert_path} - Using HTTP`);
  app.listen(PORT, () => logger.info(SERVER_START_MSG));
}