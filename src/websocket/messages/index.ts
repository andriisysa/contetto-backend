import { db } from '@/database';
import { ClientMessageType, IMessage, IMessagePayload, ServerMessageType } from '@/types/message.types';
import { IRoom, IRoomUserStatus, RoomType } from '@/types/room.types';
import { IUser } from '@/types/user.types';
import { getNow } from '@/utils';
import { generateTokens, verifyToken } from '@/utils/jwt';
import { ObjectId, WithoutId } from 'mongodb';
import { Server } from 'socket.io';

const usersCol = db.collection<WithoutId<IUser>>('users');
const roomsCol = db.collection<WithoutId<IRoom>>('rooms');
const messagesCol = db.collection<WithoutId<IMessage>>('messages');

export const messageHandler = (io: Server, socket: Socket) => {
  const messageAuth = (next: Function) => async (payload: any) => {
    try {
      const { token, orgId, msg, roomId, messageId } = payload;

      if (!token || !orgId || !roomId) {
        return socket.emit(ServerMessageType.invalidRequest, { msg: 'Invalid request' });
      }

      const accessToken = token.split(' ')[0];
      const refreshToken = token.split(' ')[1];

      if (!accessToken || !refreshToken) {
        return socket.emit(ServerMessageType.invalidRequest, { msg: 'token not found' });
      }

      let user = verifyToken(accessToken);
      if (!user) {
        user = verifyToken(refreshToken);
        if (!user) {
          return socket.emit(ServerMessageType.authError, { msg: 'unauthorized' });
        }

        const newToken = generateTokens(user);

        // update token
        socket.emit(ServerMessageType.updateToken, { token: newToken });
      }

      socket.user = user;

      const room = await roomsCol.findOne({
        _id: new ObjectId(roomId),
        orgId: new ObjectId(orgId),
        usernames: user.username,
      });
      if (!room) {
        return socket.emit(ServerMessageType.notFoundError, { msg: 'Room Not found' });
      }

      const newPayLoad: IMessagePayload = {
        room,
        user,
        msg,
        messageId,
      };

      next(newPayLoad);
    } catch (error) {
      console.log('messageAuth error ===>', error);
      return socket.emit(ServerMessageType.unknownError, error);
    }
  };

  const sendMessage = messageAuth(async (payload: IMessagePayload) => {
    try {
      const { room, user, msg } = payload;

      if (!msg) {
        return socket.emit(ServerMessageType.invalidRequest, { msg: 'Invalid request' });
      }

      // get all users
      const users = await usersCol.find({ username: { $in: room.usernames } }).toArray();

      // create message
      const msgData: WithoutId<IMessage> = {
        orgId: room.orgId,
        roomId: room._id,
        msg,
        senderName: user.username,
        createdAt: getNow(),
        updatedAt: getNow(),
        // userStatus: users.reduce((obj, u) => ({ ...obj, [u.username]: { read: false } }), {}),
        attatchMents: [],
        edited: false,
      };
      const newMsg = await messagesCol.insertOne(msgData);

      // count mentions/dms
      const mentionUsers = room.type === RoomType.dm ? room.usernames.filter((un) => un !== user.username) : [];

      // update room
      const roomUserStatus: IRoomUserStatus = {
        ...users.reduce(
          (obj, u) => ({
            ...obj,
            [u.username]: {
              ...room.userStatus[u.username],
              online: !!u.socketId,
              notis: mentionUsers.includes(u.username)
                ? room.userStatus[u.username].notis + 1
                : room.userStatus[u.username].notis,
              unRead: true,
              firstNotiMessage: mentionUsers.includes(u.username)
                ? room.userStatus[u.username].firstNotiMessage || newMsg.insertedId
                : room.userStatus[u.username].firstNotiMessage,
              firstUnReadmessage: room.userStatus[u.username].firstUnReadmessage || newMsg.insertedId,
              socketId: u.socketId,
            },
          }),
          {}
        ),
      };
      await roomsCol.updateOne({ _id: room._id }, { $set: { userStatus: roomUserStatus, dmInitiated: true } });

      const offLineUsers = users.filter((user) => !user.socketId);
      // send email if offline

      // send push noti if offline

      // send message to clients
      users.forEach((user) => {
        if (user.socketId) {
          io.to(user.socketId).emit(ServerMessageType.channelUpdate, { ...room, userStatus: roomUserStatus });
          io.to(user.socketId).emit(ServerMessageType.msgSend, { ...msgData, _id: newMsg.insertedId });
        }
      });
    } catch (error) {
      console.log('sendMessage error ===>', error);
      return socket.emit(ServerMessageType.unknownError, error);
    }
  });

  const updateMessage = messageAuth(async (payload: IMessagePayload) => {
    try {
      const { room, user, msg, messageId } = payload;

      if (!msg || !messageId) {
        return socket.emit(ServerMessageType.invalidRequest, { msg: 'Invalid request' });
      }

      // get message
      const message = await messagesCol.findOne({
        _id: new ObjectId(messageId),
        roomId: room._id,
        senderName: user.username,
      });
      if (!message) {
        return socket.emit(ServerMessageType.notFoundError, { msg: 'Message not found' });
      }

      // update message
      const msgUpdateData = {
        msg,
        edited: true,
        updatedAt: getNow(),
      };
      await messagesCol.updateOne({ _id: message._id }, { $set: msgUpdateData });

      // get all users
      const users = await usersCol.find({ username: { $in: room.usernames } }).toArray();

      // count mentions/dms
      const additionalMentionUsers = room.type === RoomType.dm ? [] : [];
      if (additionalMentionUsers.length > 0) {
        // update channel and send
        // send push noti if offline
        // send email if offline
      }

      // send message to clients
      users.forEach((user) => {
        if (user.socketId) {
          io.to(user.socketId).emit(ServerMessageType.msgUpdate, {
            ...message,
            ...msgUpdateData,
          });
        }
      });
    } catch (error) {
      console.log('sendMessage error ===>', error);
      return socket.emit(ServerMessageType.unknownError, error);
    }
  });

  const readMessage = messageAuth(async (payload: IMessagePayload) => {
    try {
      const { room, user } = payload;

      const roomUserStatus: IRoomUserStatus = {
        ...room.userStatus,
        [user.username]: {
          online: true,
          notis: 0,
          unRead: false,
          firstNotiMessage: undefined,
          firstUnReadmessage: undefined,
          socketId: socket.id,
        },
      };
      await roomsCol.updateOne({ _id: room._id }, { $set: { userStatus: roomUserStatus } });

      socket.emit(ServerMessageType.channelUpdate, { ...room, userStatus: roomUserStatus });
    } catch (error) {
      console.log('sendMessage error ===>', error);
      return socket.emit(ServerMessageType.unknownError, error);
    }
  });

  const typing = messageAuth(async (payload: IMessagePayload) => {
    try {
      const { room, user } = payload;

      // get all users
      const users = await usersCol.find({ username: { $in: room.usernames } }).toArray();

      users.forEach((user) => {
        if (user.socketId) {
          io.to(user.socketId).emit(ServerMessageType.msgTyping, { roomId: room._id, username: user.username });
        }
      });
    } catch (error) {
      console.log('sendMessage error ===>', error);
      return socket.emit(ServerMessageType.unknownError, error);
    }
  });

  socket.on(ClientMessageType.msgSend, sendMessage);
  socket.on(ClientMessageType.msgUpdate, updateMessage);
  socket.on(ClientMessageType.msgRead, readMessage);
  socket.on(ClientMessageType.msgTyping, typing);
};
