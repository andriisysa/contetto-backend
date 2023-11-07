import express from 'express';

import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import { client } from './database';
import router from './routes/intex';

dotenv.config();

const app = express();

app
  .use(
    cors({
      exposedHeaders: '*',
    })
  )
  .use(
    express.json({
      limit: '10mb',
    })
  )
  .use(helmet())
  .use(express.urlencoded({ extended: false }))
  .use('/', router);

const port = Number(process.env.PORT) || 80;

app.listen(port, async () => {
  console.log(`realm-backend running on: http://localhost:${port}`);
  try {
    await client.connect();
    console.log('db is connected!');
  } catch (error) {
    console.log('db connection error ===>', error);
  }
});
