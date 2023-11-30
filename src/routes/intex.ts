import express from 'express';
import authRouter from './authRouter';
import auth from '@/middlewares/auth';
import orgsRouter from './orgs';
import agentsRouter from './agents';
import { getAllCities, searchCitites } from '@/controllers/citites';

const router = express.Router();

router
  .get('/', (_, res) => res.status(200).send('Hello World!'))
  .get('/health', (_, res) => res.status(200).send('OK'))

  .use('/auth', authRouter)
  .use('/orgs', auth, orgsRouter)
  .use('/agents', auth, agentsRouter)
  .use('/cities', getAllCities)
  .use('/cities/search', auth, searchCitites);

export default router;
