import { Router } from 'express';
import hsm from '../services/hsm-facade';
import logger from '../services/logger';
const hsmRouter = Router();

hsmRouter.get('/generateKeyPair', async (req, res) => {
  const algorithm = req.query.algorithm === 'EDDSA' ? 'EDDSA' : 'ECDSA';
  const { keyId, pem } = await hsm.generateKeyPair(algorithm);
  console.log(`keyId`, keyId);
  res.status(200).json({ keyId, pem });
});

hsmRouter.post('/sign', async (req, res) => {
  try {
    const { keyId, payload, algorithm } = req.body;
    console.log(`got keyid: ${keyId}, payload ${payload}`);
    const signature = await hsm.sign(keyId, payload, algorithm);
    res.status(200).json({ signature });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ e: e.toString() });
  }
});

hsmRouter.post('/verify', async (req, res) => {
  try {
    const { keyId, payload, signature, algorithm } = req.body;
    console.log(`got keyid: ${keyId}, payload ${payload}, signature: ${signature}, algorithm: ${algorithm}`);
    const isVerified = await hsm.verify(keyId, signature, payload, algorithm);
    res.status(200).json({ isVerified });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ e: e.toString() });
  }
});

export default hsmRouter;
