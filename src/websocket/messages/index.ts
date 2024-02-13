import { db } from '@/database';
import { ClientMessageType, IMessage, IMessagePayload, ServerMessageType } from '@/types/message.types';
import { IRoom, IRoomUserStatus, RoomType } from '@/types/room.types';
import { IUser } from '@/types/user.types';
import { sendEmail } from '@/utils/email';
import { generateTokens, verifyToken } from '@/utils/jwt';
import { sendPush } from '@/utils/onesignal';
import { ObjectId, WithoutId } from 'mongodb';
import { Server } from 'socket.io';

const usersCol = db.collection<WithoutId<IUser>>('users');
const roomsCol = db.collection<WithoutId<IRoom>>('rooms');
const messagesCol = db.collection<WithoutId<IMessage>>('messages');

export const messageHandler = (io: Server, socket: Socket) => {
  const messageAuth = (next: Function) => async (payload: any) => {
    try {
      const { token, orgId, roomId, ...rest } = payload;

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
        ...rest,
      };

      next(newPayLoad);
    } catch (error) {
      console.log('messageAuth error ===>', error);
      return socket.emit(ServerMessageType.unknownError, error);
    }
  };

  const sendMessage = messageAuth(async (payload: IMessagePayload) => {
    try {
      const { room, user, msg, mentions = [], channels = [] } = payload;

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
        createdAt: Date.now(),
        updatedAt: Date.now(),
        // userStatus: users.reduce((obj, u) => ({ ...obj, [u.username]: { read: false } }), {}),
        attatchMents: [],
        edited: false,
        mentions: mentions,
        channels: channels,
        editable: true,
      };
      const newMsg = await messagesCol.insertOne(msgData);

      // count mentions/dms
      const mentionedUserNames =
        room.type === RoomType.dm
          ? room.usernames.filter((un) => un !== user.username)
          : mentions.filter((name) => room.usernames.includes(name) && name !== user.username);

      // update room
      const roomData: IRoom = {
        ...room,
        userStatus: {
          ...room.userStatus,
          ...room.usernames
            .filter((un) => un !== user.username)
            .reduce((obj, un) => {
              const socketIds = users.find((u) => u.username === un)?.socketIds;
              return {
                ...obj,
                [un]: {
                  ...room.userStatus[un],
                  online: socketIds ? socketIds.length > 0 : false,
                  notis: mentionedUserNames.includes(un) ? room.userStatus[un].notis + 1 : room.userStatus[un].notis,
                  unRead: true,
                  firstNotiMessage: mentionedUserNames.includes(un)
                    ? room.userStatus[un].firstNotiMessage || newMsg.insertedId
                    : room.userStatus[un].firstNotiMessage,
                  firstUnReadmessage: room.userStatus[un].firstUnReadmessage || newMsg.insertedId,
                },
              };
            }, {}),
        },
      };

      if (room.type === RoomType.dm && !room.dmInitiated) {
        roomData.dmInitiated = true;
      }

      await roomsCol.updateOne({ _id: room._id }, { $set: roomData });

      // send message to clients
      users.forEach((u) => {
        u.socketIds?.forEach((socketId) => {
          io.to(socketId).emit(ServerMessageType.channelUpdate, roomData);

          // send message
          io.to(socketId).emit(ServerMessageType.msgSend, { ...msgData, _id: newMsg.insertedId });
        });
      });

      const mentionedUsers = users.filter((u) => mentionedUserNames.includes(u.username));
      // send email if offline
      mentionedUsers.forEach(async (u) => {
        try {
          const agent = roomData.agents.find((a) => a.username === u.username);
          if (agent) {
            await sendEmail(
              u.emails[0].email,
              'New message',
              undefined,
              `
            <p>
              You have a new message from ${user.username}
              Please check <a href="${process.env.WEB_URL}/app/agent-orgs/${agent._id}/rooms/${room._id}" target="_blank">here</a>
            </p>
            `
            );

            sendPush({
              name: 'New Message',
              headings: 'New Message',
              contents: `You have a new message from ${user.username}`,
              userId: u.username,
              url: `${process.env.SCHEME_APP}://app/agent-orgs/${agent._id}/rooms/${room._id}`,
            });

            // send desktop notification
            u.socketIds?.forEach((socketId) =>
              io.to(socketId).emit(ServerMessageType.electronNotification, {
                title: `New message from ${user.username}`,
                body: msg,
                url: `${process.env.WEB_URL}/app/agent-orgs/${agent._id}/rooms/${room._id}`,
              })
            );
            return;
          }

          const contact = roomData.contacts.find((c) => c.username === u.username);
          if (contact) {
            await sendEmail(
              u.emails[0].email,
              'New message',
              undefined,
              `
            <p>
              You have a new message from ${user.username}
              Please join <a href="${process.env.WEB_URL}/app/contact-orgs/${contact._id}/rooms/${room._id}" target="_blank">here</a>
            </p>
            `
            );

            sendPush({
              name: 'New Message',
              headings: 'New Message',
              contents: `You have a new message from ${user.username}`,
              userId: u.username,
              url: `${process.env.SCHEME_APP}://app/contact-orgs/${contact._id}/rooms/${room._id}`,
            });

            // send desktop notification
            u.socketIds?.forEach((socketId) =>
              io.to(socketId).emit(ServerMessageType.electronNotification, {
                title: `New message from ${user.username}`,
                body: msg,
                url: `${process.env.WEB_URL}/app/contact-orgs/${contact._id}/rooms/${room._id}`,
              })
            );
          }
        } catch (error) {
          console.log('emain send error ===>', error);
        }
      });
      // send push noti if offline
    } catch (error) {
      console.log('sendMessage error ===>', error);
      return socket.emit(ServerMessageType.unknownError, error);
    }
  });

  const updateMessage = messageAuth(async (payload: IMessagePayload) => {
    try {
      const { room, user, msg, messageId, mentions = [], channels = [] } = payload;

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

      // count mentions/dms
      const additionalMentions =
        room.type === RoomType.dm ? [] : mentions.filter((m) => !message.mentions.includes(m) && m !== user.username);

      // update message
      const msgUpdateData = {
        msg,
        edited: true,
        updatedAt: Date.now(),
        mentions: [...message.mentions, ...additionalMentions],
        channels: [...message.channels, ...channels],
      };
      await messagesCol.updateOne({ _id: message._id }, { $set: msgUpdateData });

      // get all users
      const users = await usersCol.find({ username: { $in: room.usernames } }).toArray();

      // send message to clients
      users.forEach((u) => {
        u.socketIds?.forEach((socketId) => {
          io.to(socketId).emit(ServerMessageType.msgUpdate, {
            ...message,
            ...msgUpdateData,
          });
        });
      });

      if (additionalMentions.length) {
        // room update
        const roomData: IRoom = {
          ...room,
          userStatus: {
            ...room.userStatus,
            ...users
              .filter((u) => additionalMentions.includes(u.username))
              .reduce((obj, u) => {
                const socketIds = u.socketIds;
                return {
                  ...obj,
                  [u.username]: {
                    ...room.userStatus[u.username],
                    online: socketIds ? socketIds.length > 0 : false,
                    notis: room.userStatus[u.username].notis + 1,
                    unRead: true,
                    firstNotiMessage: room.userStatus[u.username].firstNotiMessage || message._id,
                    firstUnReadmessage: room.userStatus[u.username].firstUnReadmessage || message._id,
                  },
                };
              }, {}),
          },
        };

        await roomsCol.updateOne({ _id: room._id }, { $set: roomData });

        // send room update
        users
          .filter((u) => additionalMentions.includes(u.username))
          .forEach((u) => {
            u.socketIds?.forEach((socketId) => io.to(socketId).emit(ServerMessageType.channelUpdate, roomData));
          });
      }
    } catch (error) {
      console.log('sendMessage error ===>', error);
      return socket.emit(ServerMessageType.unknownError, error);
    }
  });

  const deleteMessage = messageAuth(async (payload: IMessagePayload) => {
    try {
      const { room, user, messageId } = payload;

      if (!messageId) {
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

      await messagesCol.deleteOne({ _id: message._id });

      // get all users
      const users = await usersCol.find({ username: { $in: room.usernames } }).toArray();

      users.forEach((u) => {
        u.socketIds?.forEach((socketId) => io.to(socketId).emit(ServerMessageType.msgDelete, message));
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
        },
      };
      await roomsCol.updateOne({ _id: room._id }, { $set: { userStatus: roomUserStatus } });

      socket.emit(ServerMessageType.msgRead, { ...room, userStatus: roomUserStatus });
    } catch (error) {
      console.log('sendMessage error ===>', error);
      return socket.emit(ServerMessageType.unknownError, error);
    }
  });

  const typing = messageAuth(async (payload: IMessagePayload) => {
    try {
      const { room, user, typing } = payload;

      // get all users
      const users = await usersCol.find({ username: { $in: room.usernames } }).toArray();

      users
        .filter((u) => u.username !== user.username)
        .forEach((u) => {
          u.socketIds?.forEach((socketId) =>
            io.to(socketId).emit(ServerMessageType.msgTyping, {
              roomId: room._id,
              username: user.username,
              typing: !!typing,
            })
          );
        });
    } catch (error) {
      console.log('sendMessage error ===>', error);
      return socket.emit(ServerMessageType.unknownError, error);
    }
  });

  socket.on(ClientMessageType.msgSend, sendMessage);
  socket.on(ClientMessageType.msgUpdate, updateMessage);
  socket.on(ClientMessageType.msgDelete, deleteMessage);
  socket.on(ClientMessageType.msgRead, readMessage);
  socket.on(ClientMessageType.msgTyping, typing);
};
