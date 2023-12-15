import type { Request, Response } from 'express';
import { ObjectId, WithoutId } from 'mongodb';

import { db } from '@/database';

import { IUser } from '@/types/user.types';
import { IRoom, IRoomAgent, IRoomContact, RoomType } from '@/types/room.types';
import { IAgentProfile } from '@/types/agentProfile.types';
import { getNow } from '@/utils';
import { IMessage, ServerMessageType } from '@/types/message.types';
import { io } from '@/socketServer';
import { IContact } from '@/types/contact.types';

const usersCol = db.collection<WithoutId<IUser>>('users');
const agentProfilesCol = db.collection<WithoutId<IAgentProfile>>('agentProfiles');
const contactsCol = db.collection<WithoutId<IContact>>('contacts');
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
      agents: [{ _id: agentProfile._id, username: user.username }],
      contacts: [],
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
      updatedAt: getNow(),
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

    const { agents = [], contacts = [] } = req.body;
    if (agents.length === 0 && contacts.length === 0) {
      return res.status(401).json({ msg: 'Invalid request!' });
    }

    // check valid agents and contacts
    const agentProfiles = await agentProfilesCol
      .find({
        orgId: agentProfile.orgId,
        username: { $in: [...(agents as IRoomAgent[]), agentProfile].map((agent) => agent.username) },
      })
      .toArray();
    if (
      [...(agents as IRoomAgent[]).filter((a) => a.username !== agentProfile.username), agentProfile].length !==
      agentProfiles.length
    ) {
      return res.status(401).json({ msg: 'Invalid request!' });
    }

    const contactProfiles = await contactsCol
      .find({
        _id: { $in: (contacts as IRoomContact[]).map((contact) => new ObjectId(contact._id)) },
        orgId: agentProfile.orgId,
        username: { $exists: true, $ne: undefined },
      })
      .toArray();
    if (contactProfiles.length !== contacts.length) {
      return res.status(401).json({ msg: 'Invalid request!' });
    }

    // check duplicated username
    const users = await usersCol
      .find({ username: { $in: [...agentProfiles, ...contactProfiles].map((ac) => ac.username!) } })
      .toArray();

    if (users.length !== [...agentProfiles, ...contactProfiles].length) {
      return res.status(401).json({ msg: 'Invalid request! Duplicated username' });
    }

    // check dm already exists
    const dm = await roomsCol.findOne({
      orgId: agentProfile.orgId,
      usernames: { $all: users.map((u) => u.username) },
    });
    if (dm) return res.json(dm);

    const data: WithoutId<IRoom> = {
      orgId: agentProfile.orgId,
      usernames: users.map((u) => u.username),
      agents: agentProfiles.map((ap) => ({ _id: ap._id, username: ap.username })),
      contacts: contactProfiles.map((cp) => ({
        _id: cp._id,
        agentId: cp.agentProfileId,
        username: cp.username!,
        agentName: cp.agentName,
      })),
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
      updatedAt: getNow(),
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

    const data = { name, updatedAt: getNow() };

    await roomsCol.updateOne({ _id: room._id }, { $set: data });

    // send message in all members
    const users = await usersCol.find({ username: room.usernames }).toArray();
    users.forEach((user) => {
      if (io && user.socketId) {
        io.to(user.socketId).emit(ServerMessageType.channelUpdate, { ...room, ...data });
      }
    });

    return res.json({ ...room, ...data });
  } catch (error) {
    console.log('updateChannel error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getAllRooms = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const { id: orgId, contactId } = req.params;

    if (contactId) {
      const contactProfile = await contactsCol.findOne({
        _id: new ObjectId(contactId),
        orgId: new ObjectId(orgId),
        username: user.username,
      });

      if (contactProfile) {
        const rooms = await roomsCol.find({
          orgId: new ObjectId(orgId),
          'contacts._id': contactProfile._id,
          'contacts.username': user.username,
          $or: [{ type: RoomType.channel }, { type: RoomType.dm, dmInitiated: true }],
        });

        return res.json(rooms);
      }

      return res.json([]);
    }
    const agentProfile = await agentProfilesCol.findOne({ orgId: new ObjectId(orgId), username: user.username });
    if (agentProfile) {
      const rooms = await roomsCol.find({
        orgId: new ObjectId(orgId),
        'agents.username': user.username,
        $or: [{ type: RoomType.channel }, { type: RoomType.dm, dmInitiated: true }],
      });

      return res.json(rooms);
    }

    return res.json([]);
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
    const { agents = [], contacts = [] } = req.body;
    if (agents.length === 0 && contacts.length === 0) {
      return res.status(401).json({ msg: 'Invalid request!' });
    }

    const room = await roomsCol.findOne({
      _id: new ObjectId(roomId),
      orgId: agentProfile.orgId,
      'agents.username': user.username,
      type: RoomType.channel,
    });

    if (!room) {
      return res.status(404).json({ msg: 'Room not found' });
    }

    const agentProfiles = await agentProfilesCol
      .find({
        orgId: agentProfile.orgId,
        username: { $in: (agents as IRoomAgent[]).map((agent) => agent.username) },
      })
      .toArray();
    if ((agents as IRoomAgent[]).length !== agentProfiles.length) {
      return res.status(401).json({ msg: 'Invalid request!' });
    }

    const contactProfiles = await contactsCol
      .find({
        _id: { $in: (contacts as IRoomContact[]).map((contact) => new ObjectId(contact._id)) },
        orgId: agentProfile.orgId,
        username: { $exists: true, $ne: undefined },
      })
      .toArray();
    if (contactProfiles.length !== contacts.length) {
      return res.status(401).json({ msg: 'Invalid request!' });
    }

    const filteredAgents = agentProfiles.filter((ap) => !room.usernames.includes(ap.username));
    const filteredContacts = contactProfiles
      .filter((cp) => !room.usernames.includes(cp.username!))
      .filter((cp) => !filteredAgents.find((ap) => ap.username === cp.username));
    const newUsers = await usersCol
      .find({ username: { $in: [...filteredAgents, ...filteredContacts].map((f) => f.username!) } })
      .toArray();
    const existingUsers = await usersCol.find({ username: { $in: room.usernames } }).toArray();

    const msg = `${newUsers.map((user) => user.username).join(', ')} joined`;

    const msgData: WithoutId<IMessage> = {
      roomId: room._id,
      orgId: agentProfile.orgId,
      msg,
      senderName: user.username,
      createdAt: getNow(),
      updatedAt: getNow(),
      // userStatus: [...existingUsers, ...newUsers].reduce((obj, u) => ({ ...obj, [u.username]: { read: false } }), {}),
      attatchMents: [],
      edited: false,
    };
    const newMessage = await messagesCol.insertOne(msgData);

    const roomData: IRoom = {
      ...room,
      usernames: [...newUsers, ...existingUsers].map((u) => u.username),
      agents: [...room.agents, ...filteredAgents.map((ap) => ({ _id: ap._id, username: ap.username }))],
      contacts: [
        ...room.contacts,
        ...filteredContacts.map((cp) => ({
          _id: cp._id,
          username: cp.username!,
          agentId: cp.agentProfileId,
          agentName: cp.agentName,
        })),
      ],
      userStatus: {
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
      },
    };

    await roomsCol.updateOne(
      { _id: room._id },
      {
        $set: roomData,
      }
    );

    const data = {
      message: { ...msgData, _id: newMessage.insertedId },
      room: roomData,
    };

    // send message to all members in channel
    [...newUsers, ...existingUsers].forEach((user) => {
      if (io && user.socketId) {
        io.to(user.socketId).emit(ServerMessageType.channelJoin, roomData);
        io.to(user.socketId).emit(ServerMessageType.msgSend, { ...msgData, _id: newMessage.insertedId });
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
