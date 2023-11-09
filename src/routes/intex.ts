import express from 'express';
import authRouter from './authRouter';
import auth from '@/middlewares/auth';
import orgsRouter from './orgs';

const router = express.Router();

router
  .get('/', (_, res) => res.status(200).send('Hello World!'))
  .get('/health', (_, res) => res.status(200).send('OK'))

  .use('/auth', authRouter)
  .use('/orgs', auth, orgsRouter);

export default router;
