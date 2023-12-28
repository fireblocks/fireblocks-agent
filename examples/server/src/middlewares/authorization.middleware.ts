import { Request, Response } from 'express';

export const authMiddleware = (req: Request, res: Response, next) => {
  const authKey = req.headers.authorization;
  if (!authKey) {
    return next();
  }
  const knownApiKeys = process.env.KNOWN_API_KEYS?.split(',') || [];
  if (knownApiKeys.includes(authKey)) {
    return next();
  }
  return res.status(401).send(`Unauthorized API Key ${authKey}`);
};
