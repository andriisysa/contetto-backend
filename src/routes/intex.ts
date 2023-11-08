import express from 'express';
import authRouter from './authRouter';

const router = express.Router();

router
  .get('/', (_, res) => res.status(200).send('Hello World!'))
  .get('/health', (_, res) => res.status(200).send('OK'))

  .use('/auth', authRouter);

export default router;
