// file upload
// time check

import express from 'express';

import { getOne } from '@/controllers/agents';

const agentsRouter = express.Router();

agentsRouter.get('/:id', getOne);

export default agentsRouter;
