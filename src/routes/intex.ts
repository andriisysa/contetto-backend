import express from 'express';
import authRouter from './authRouter';
import auth from '@/middlewares/auth';
import orgsRouter from './orgs';
import agentsRouter from './agents';
import citiesRouter from './cities';
import { getAllRooms } from '@/controllers/rooms';
import adminRouter from './admin';
import fileShareRouter from './fileshare';
import { getIndustries } from '@/controllers/admin/industry';
import { getPageBySlug, getPublicPages } from '@/controllers/pages';

const router = express.Router();

router
  .get('/', (_, res) => res.status(200).send('Hello World!'))
  .get('/health', (_, res) => res.status(200).send('OK'))

  .get('/pages', getPublicPages)
  .get('/pages/:slug', getPageBySlug)
  .get('/rooms', auth, getAllRooms)
  .get('/industries', auth, getIndustries)
  .use('/auth', authRouter)
  .use('/orgs', auth, orgsRouter)
  .use('/agents', auth, agentsRouter)
  .use('/cities', auth, citiesRouter)
  .use('/fileshare', fileShareRouter)

  .use('/admin', adminRouter);

export default router;
