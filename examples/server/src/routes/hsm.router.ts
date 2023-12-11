import { Router } from 'express';
import hsm from '../services/hsm-facade';
const hsmRouter = Router();

hsmRouter.get('/generateKeyPair', async (req, res) => {
  const keyId = await hsm.generateKeyPair();
  console.log(`keyId`, keyId);
  res.status(200).json({ keyId });
});

hsmRouter.post('/sign', async (req, res) => {
  try {
    const { keyId, payload } = req.body;
    console.log(`got keyid: ${keyId}, payload ${payload}`);
    const signature = await hsm.sign(keyId, payload);
    res.status(200).json({ signature });
  } catch (e) {
    res.status(500).json({ e });
  }
});

hsmRouter.post('/verify', async (req, res) => {
  try {
    const { keyId, payload, signature } = req.body;
    console.log(`got keyid: ${keyId}, payload ${payload}, signature: ${signature}`);
    const isVerified = await hsm.verify(keyId, signature, payload);
    res.status(200).json({ isVerified });
  } catch (e) {
    res.status(500).json({ e: e.toString() });
  }
});

export default hsmRouter;
