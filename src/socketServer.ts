import { createAdapter } from '@socket.io/mongo-adapter';
import { db } from './database';
import { WithoutId } from 'mongodb';
import { IRoom } from './types/room.types';
import { verifyToken } from './utils/jwt';
import { IUser } from './types/user.types';
import { messageHandler } from './websocket/messages';
import { ServerMessageType } from './types/message.types';
import { Server } from 'socket.io';
import http from 'http';

export const SOCKET_IO_COLLECTION = 'socketio';

const usersCol = db.collection<WithoutId<IUser>>('users');
const roomsCol = db.collection<WithoutId<IRoom>>('rooms');

export let io: Server | undefined = undefined;

const setupSocketServer = async (httpServer: http.Server) => {
  try {
    console.log('Create socket collection');

    await db.createCollection(SOCKET_IO_COLLECTION, {
      capped: true,
      size: 1e6,
    });
  } catch (e) {
    // collection already exists
    console.log('socket collection already exists');
  }

  io = new Server(httpServer, {
    // for websocket transport
    // cors: {
    //   origin: '*',
    //   methods: ['GET', 'POST'],
    // },

    // for sticky session amd http long polling
    cors: {
      origin: ['http://localhost:3000', 'http://127.0.0.1:3000', `${process.env.WEB_URL}`], // for using sticky session for multi-instances
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  const collection = db.collection(SOCKET_IO_COLLECTION);

  io.adapter(createAdapter(collection));

  // when socket is handshaking and connected
  io.use(async function (socket: Socket, next) {
    if (socket.handshake.auth && socket.handshake.auth.token) {
      const token = socket.handshake.auth.token;
      const accessToken = token.split(' ')[0];
      const refreshToken = token.split(' ')[1];

      let user = verifyToken(accessToken) as IUser;
      if (!user) {
        user = verifyToken(refreshToken);
      }

      if (user) {
        // update user
        await usersCol.updateOne(
          { username: user.username },
          {
            $set: {
              socketId: socket.id,
            },
          }
        );

        await roomsCol.updateMany(
          { usernames: user.username },
          {
            $set: {
              [`userStatus.${user.username}.online`]: true,
              [`userStatus.${user.username}.socketId`]: socket.id,
            },
          }
        );

        socket.user = user;

        return next();
      }
    }

    // next();
    next(new Error('not authorized'));
  }).on('connection', (socket: Socket) => {
    socket.emit(ServerMessageType.connected, { msg: 'Welcome from server' });

    // will be called after socket.use() middleware
    messageHandler(io as Server, socket);

    // when socket is disconnected
    socket.on('disconnect', async (as: any) => {
      const user = socket.user;
      if (user) {
        // update user
        await usersCol.updateOne(
          { username: user.username },
          {
            $set: {
              socketId: undefined,
            },
          }
        );

        await roomsCol.updateMany(
          { usernames: user.username },
          {
            $set: {
              [`userStatus.${user.username}.online`]: false,
              [`userStatus.${user.username}.socketId`]: undefined,
            },
          }
        );
      }
    });

    // may consider later, but not for now
    // // middleware - whenever message is coming from client
    // socket.use(([event, ...args], next) => {
    //   console.log('socket middleware');
    //   console.log(event, args);

    //   if (socket.user) {
    //     next();
    //   }
    // });
    // socket.on('error', (err: any) => {
    //   console.log('error =>', err);
    //   if (err && err.message === 'unauthorized event') {
    //     socket.disconnect();
    //   }
    // });
  });
};

export default setupSocketServer;
