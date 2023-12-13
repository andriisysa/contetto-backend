import type { Request, Response } from 'express';
import { ObjectId, WithoutId } from 'mongodb';

import { db } from '@/database';

import { IUser } from '@/types/user.types';
import { IRoom, RoomType } from '@/types/room.types';
import { IAgentProfile } from '@/types/agentProfile.types';
import { getNow } from '@/utils';
import { IMessage } from '@/types/message.types';
import { io } from '@/index';

const usersCol = db.collection<WithoutId<IUser>>('users');
const roomsCol = db.collection<WithoutId<IRoom>>('rooms');
const messagesCol = db.collection<WithoutId<IMessage>>('messages');

export const createChannel = async (req: Request, res: Response) => {
  try {
    const user = (await usersCol.findOne({ username: req.user?.username })) as IUser;
    const agentProfile = req.agentProfile as IAgentProfile;

    const { name } = req.body;
    const room = await roomsCol.findOne({ orgId: agentProfile.orgId, name });
    if (room) {
      return res.status(401).json({ msg: 'Channel already exists' });
    }

    const data: WithoutId<IRoom> = {
      orgId: agentProfile.orgId,
      name,
      usernames: [user.username],
      creator: user.username,
      type: RoomType.channel,
      userStatus: {
        [user.username]: {
          online: true,
          notis: 0,
          unRead: false,
          firstNotiMessage: undefined,
          firstUnReadmessage: undefined,
          socketId: user.socketId,
        },
      },
      createdAt: getNow(),
    };

    const newRoom = await roomsCol.insertOne(data);

    return res.json({ ...data, _id: newRoom.insertedId });
  } catch (error) {
    console.log('createChannel error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const createDm = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const agentProfile = req.agentProfile as IAgentProfile;

    const { usernames = [] } = req.body;
    const dm = await roomsCol.findOne({ orgId: agentProfile.orgId, usernames: { $all: usernames } });
    if (dm) return res.json(dm);

    const users = await usersCol.find({ username: { $in: usernames } }).toArray();

    const data: WithoutId<IRoom> = {
      orgId: agentProfile.orgId,
      usernames: users.map((user) => user.username),
      creator: user.username,
      type: RoomType.dm,
      dmInitiated: false,
      userStatus: users.reduce(
        (obj, u) => ({
          ...obj,
          [u.username]: {
            online: !!u.socketId,
            notis: 0,
            unRead: false,
            firstNotiMessage: undefined,
            firstUnReadmessage: undefined,
            socketId: u.socketId,
          },
        }),
        {}
      ),
      createdAt: getNow(),
    };
    const newDM = await roomsCol.insertOne(data);

    return res.json({ ...data, _id: newDM.insertedId });
  } catch (error) {
    console.log('createDm error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const updateChannel = async (req: Request, res: Response) => {
  try {
    const user = (await usersCol.findOne({ username: req.user?.username })) as IUser;
    const agentProfile = req.agentProfile as IAgentProfile;
    const { roomId } = req.params;

    const { name } = req.body;

    const room = await roomsCol.findOne({
      _id: new ObjectId(roomId),
      orgId: agentProfile.orgId,
      usernames: user.username,
    });
    if (!room) {
      return res.status(404).json({ msg: 'Room not found' });
    }

    await roomsCol.updateOne({ _id: room._id }, { $set: { name } });

    return res.json({ ...room, name });
  } catch (error) {
    console.log('updateChannel error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getAllRooms = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const { id: orgId } = req.params;

    const rooms = await roomsCol.find({
      orgId: new ObjectId(orgId),
      usernames: user.username,
      $or: [{ type: RoomType.channel }, { type: RoomType.dm, dmInitiated: true }],
    });

    return res.json(rooms);
  } catch (error) {
    console.log('getAllRooms error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const addMemberToChannel = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const agentProfile = req.agentProfile as IAgentProfile;

    const { roomId } = req.params;
    const { usernames = [] } = req.body;

    const room = await roomsCol.findOne({
      orgId: agentProfile.orgId,
      usernames: user.username,
      _id: new ObjectId(roomId),
      type: RoomType.channel,
    });

    if (!room) {
      return res.status(404).json({ msg: 'Room not found' });
    }

    const filteredUsernames = (usernames as string[]).filter((username) => !room.usernames.includes(username));
    const newUsers = await usersCol.find({ username: { $in: filteredUsernames } }).toArray();
    const existingUsers = await usersCol.find({ username: { $in: room.usernames } }).toArray();

    const msg = `${newUsers.map((user) => user.username).join(', ')} joined`;

    const msgData: WithoutId<IMessage> = {
      roomId: room._id,
      orgId: agentProfile.orgId,
      msg,
      senderName: user.username,
      createdAt: getNow(),
      updatedAt: getNow(),
      userStatus: [...existingUsers, ...newUsers].reduce((obj, u) => ({ ...obj, [u.username]: { read: false } }), {}),
      attatchMents: [],
    };
    const newMessage = await messagesCol.insertOne(msgData);

    const roomUserStatus = {
      ...existingUsers.reduce(
        (obj, u) => ({
          ...obj,
          [u.username]: {
            ...room.userStatus[u.username],
            online: !!u.socketId,
            unRead: true,
            firstUnReadmessage: room.userStatus[u.username].firstUnReadmessage || newMessage.insertedId,
            socketId: u.socketId,
          },
        }),
        {}
      ),
      ...newUsers.reduce(
        (obj, u) => ({
          ...obj,
          [u.username]: {
            online: !!u.socketId,
            notis: 1,
            unRead: true,
            firstNotiMessage: newMessage.insertedId,
            firstUnReadmessage: newMessage.insertedId,
            socketId: u.socketId,
          },
        }),
        {}
      ),
    };

    await roomsCol.updateOne(
      { _id: room._id },
      {
        $set: {
          userStatus: roomUserStatus,
        },
      }
    );

    const data = {
      message: { ...msgData, _id: newMessage.insertedId },
      room: { ...room, userStatus: roomUserStatus },
    };

    // send message to all members in channel
    [...newUsers, ...existingUsers].forEach((user) => {
      if (user.socketId) {
        io.to(user.socketId).emit('message', data);
      }
    });

    // send email if offline

    // send push notification if offline

    return res.json(data);
  } catch (error) {
    console.log('addMemberToChannel error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const inviteToChannel = async (req: Request, res: Response) => {
  try {
    return res.json({});
  } catch (error) {
    console.log('inviteToChannel error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const archiveRoom = async (req: Request, res: Response) => {
  try {
  } catch (error) {
    console.log('archiveRoom error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
