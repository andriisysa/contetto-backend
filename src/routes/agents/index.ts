// file upload
// time check

import express from 'express';

import { getOne, myContacts } from '@/controllers/agents';

const agentsRouter = express.Router();

agentsRouter
  .get('/:id', getOne)
  .get('/:id/contacts', myContacts);

export default agentsRouter;