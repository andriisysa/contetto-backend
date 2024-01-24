import express from 'express';
import authRouter from './authRouter';
import auth from '@/middlewares/auth';
import orgsRouter from './orgs';
import agentsRouter from './agents';
import citiesRouter from './cities';
import { getAllRooms } from '@/controllers/rooms';
import adminAuth from '@/middlewares/adminAuth';
import adminRouter from './admin';

const router = express.Router();

router
  .get('/', (_, res) => res.status(200).send('Hello World!'))
  .get('/health', (_, res) => res.status(200).send('OK'))

  .get('/rooms', auth, getAllRooms)
  .use('/auth', authRouter)
  .use('/orgs', auth, orgsRouter)
  .use('/agents', auth, agentsRouter)
  .use('/cities', auth, citiesRouter)
  .use('/admin', adminAuth, adminRouter);

export default router;
