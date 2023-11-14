import express from 'express';

import { findOne, searchListings } from '@/controllers/search';

const serachRouter = express.Router();

serachRouter.get('/', searchListings).get('/:id', findOne);

export default serachRouter;
