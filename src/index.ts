import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import { client } from './database';
import router from './routes/intex';
import setupSocketServer from './socketServer';

dotenv.config();

const app = express();
const httpServer = createServer(app);

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

export const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:*', 'http://127.0.0.1:*', `${process.env.WEB_URL}:*`], // for using sticky session for multi-instances
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

httpServer.listen(port, async () => {
  console.log(`realm-backend running on: http://localhost:${port}`);
  try {
    await client.connect();
    console.log('db is connected!');

    setupSocketServer();
  } catch (error) {
    console.log('db connection error ===>', error);
  }
});
