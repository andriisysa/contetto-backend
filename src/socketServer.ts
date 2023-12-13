import { createAdapter } from '@socket.io/mongo-adapter';
import { db } from './database';
import { io } from '.';
import { ObjectId, WithoutId } from 'mongodb';
import { IRoom } from './types/room.types';
import { generateTokens, verifyToken } from './utils/jwt';
import { IUser } from './types/user.types';
import { messageHandler } from './websocket/messages';

export const SOCKET_IO_COLLECTION = 'socketio';

const usersCol = db.collection<WithoutId<IUser>>('users');
const roomsCol = db.collection<WithoutId<IRoom>>('rooms');

const setupSocketServer = async () => {
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

  const collection = db.collection(SOCKET_IO_COLLECTION);

  io.adapter(createAdapter(collection));

  // when socket is handshaking and connected
  io.use(async function (socket: Socket, next) {
    if (socket.handshake.auth && socket.handshake.auth.token) {
      const token = socket.handshake.auth.token;
      const accessToken = token.split(' ')[0];
      const refreshToken = token.split(' ')[1];

      socket.token = undefined;

      let user = verifyToken(accessToken) as IUser;
      if (!user) {
        user = verifyToken(refreshToken);
        if (user) {
          // update token
          socket.token = generateTokens(user);
        }
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
      }
    }

    next();
  }).on('connection', (socket: Socket) => {
    // // middleware - whenever message is coming from client
    // socket.use(([event, ...args], next) => {
    //   console.log('socket middleware');
    //   console.log(event, args);

    //   if (socket.user) {
    //     next();
    //   }
    // });

    // will be called after socket.use() middleware
    messageHandler(io, socket);

    socket.on('error', (err) => {
      if (err && err.message === 'unauthorized event') {
        socket.disconnect();
      }
    });

    // when socket is disconnected
    socket.on('disconnect', async () => {
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
  });
};

export default setupSocketServer;
