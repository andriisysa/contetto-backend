import { copySharedFile, getFile } from '@/controllers/fileshare';
import auth from '@/middlewares/auth';
import express from 'express';

const fileShareRouter = express.Router();

fileShareRouter
  .get('/:id', getFile)
  .post('/:id/copy', auth, copySharedFile);

export default fileShareRouter;
