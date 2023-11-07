import express from 'express';

const router = express.Router();

router
  .get('/', (_, res) => res.status(200).send('Hello World!'))
  .get('/health', (_, res) => res.status(200).send('OK'));

export default router;
