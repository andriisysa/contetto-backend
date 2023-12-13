import { db } from '@/database';
import { IMessagePayload } from '@/types/message.types';
import { IRoom } from '@/types/room.types';
import { generateTokens, verifyToken } from '@/utils/jwt';
import { ObjectId, WithoutId } from 'mongodb';
import { Server } from 'socket.io';

const roomsCol = db.collection<WithoutId<IRoom>>('rooms');

export const messageHandler = (io: Server, socket: Socket) => {
  const messageAuth = (next: Function) => async (payload: any) => {
    try {
      const { token, orgId, msg, roomId } = payload;

      if (!token || !msg || !orgId || !roomId) {
        return socket.emit('error', { msg: 'Invalid request' });
      }

      const accessToken = token.split(' ')[0];
      const refreshToken = token.split(' ')[1];

      if (!accessToken || !refreshToken) {
        return socket.emit('error', { msg: 'token not found' });
      }

      let user = verifyToken(accessToken);
      if (!user) {
        user = verifyToken(refreshToken);
        if (!user) {
          return socket.emit('error', { msg: 'unauthorized' });
        }

        const newToken = generateTokens(user);

        // update token
        socket.emit('updateToken', { token: newToken });
      }

      const room = await roomsCol.findOne({
        _id: new ObjectId(roomId),
        orgId: new ObjectId(orgId),
        usernames: user.username,
      });
      if (!room) {
        return socket.emit('error', { msg: 'Room Not found' });
      }

      const newPayLoad: IMessagePayload = {
        room,
        user,
        msg,
      };

      next(newPayLoad);
    } catch (error) {
      console.log('messageAuth error ===>', error);
      return socket.emit('error', error);
    }
  };

  const sendMessage = messageAuth((payload: IMessagePayload) => {
    try {
      const { room, user, msg } = payload;
      console.log('room ===>', room)
      // create message

      // count mentions/dms

      // update room

      // send email if offline

      // send push noti if offline

      // send message to clients
    } catch (error) {
      console.log('sendMessage error ===>', error);
      return socket.emit('error', error);
    }
  });

  socket.on('msg:send', sendMessage);
};
