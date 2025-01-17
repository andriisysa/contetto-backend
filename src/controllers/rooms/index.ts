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
import { sendEmail } from '@/utils/email';
import { sendPush } from '@/utils/onesignal';

const usersCol = db.collection<WithoutId<IUser>>('users');
const agentProfilesCol = db.collection<WithoutId<IAgentProfile>>('agentProfiles');
const contactsCol = db.collection<WithoutId<IContact>>('contacts');
const roomsCol = db.collection<WithoutId<IRoom>>('rooms');
const messagesCol = db.collection<WithoutId<IMessage>>('messages');

export const createChannel = async (req: Request, res: Response) => {
  try {
    const user = (await usersCol.findOne({ username: req.user?.username })) as IUser;
    const agentProfile = req.agentProfile as IAgentProfile;

    const { name, isPublic = false } = req.body;
    const room = await roomsCol.findOne({ orgId: agentProfile.orgId, name, deleted: false });
    if (room) {
      return res.status(401).json({ msg: 'Channel already exists' });
    }

    const data: WithoutId<IRoom> = {
      orgId: agentProfile.orgId,
      name,
      usernames: [user.username],
      agents: [
        {
          _id: agentProfile._id,
          username: agentProfile.username,
          userImage: agentProfile.userImage,
          userDisplayName: agentProfile.userDisplayName,
          displayName: agentProfile.displayName,
          image: agentProfile.image,
        },
      ],
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
        },
      },
      createdAt: getNow(),
      updatedAt: getNow(),
      deleted: false,
      isPublic,
    };

    if (isPublic) {
      const agents = await agentProfilesCol.find({ orgId: agentProfile.orgId }).toArray();
      const users = await usersCol.find({ username: { $in: agents.map((a) => a.username) } }).toArray();

      data.usernames = agents.map((a) => a.username);
      data.agents = agents.map((a) => ({
        _id: a._id,
        username: a.username,
        userImage: a.userImage,
        userDisplayName: a.userDisplayName,
        displayName: a.displayName,
        image: a.image,
      }));
      data.userStatus = users.reduce(
        (obj, u) => ({
          ...obj,
          [u.username]: {
            online: u.socketIds ? u.socketIds.length > 0 : false,
            notis: 0,
            unRead: false,
            firstNotiMessage: undefined,
            firstUnReadmessage: undefined,
          },
        }),
        {}
      );
      const newRoom = await roomsCol.insertOne(data);

      users
        .filter((u) => u.username !== user.username)
        .map((u) => {
          u.socketIds?.map((socketId) => {
            if (io) {
              io.to(socketId).emit(ServerMessageType.channelJoin, { ...data, _id: newRoom.insertedId });
            }
          });
        });

      return res.json({ ...data, _id: newRoom.insertedId });
    } else {
      const newRoom = await roomsCol.insertOne(data);

      return res.json({ ...data, _id: newRoom.insertedId });
    }
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
        // username: { $exists: true, $ne: undefined },
      })
      .toArray();
    if (contactProfiles.length !== contacts.length) {
      return res.status(401).json({ msg: 'Invalid request!' });
    }

    // check duplicated username
    const users = await usersCol
      .find({
        username: {
          $in: [
            ...agentProfiles.map((ap) => ap.username),
            ...contactProfiles.filter((cp) => cp.username).map((cp) => cp.username!),
          ],
        },
      })
      .toArray();

    if (
      [...users, ...contactProfiles.filter((cp) => !cp.username)].length !==
      [...agentProfiles, ...contactProfiles].length
    ) {
      return res.status(401).json({ msg: 'Invalid request! Duplicated username' });
    }

    // check dm already exists
    const dm = await roomsCol.findOne({
      orgId: agentProfile.orgId,
      usernames: {
        $all: [
          ...users.map((u) => u.username),
          ...contactProfiles.filter((cp) => !cp.username).map((cp) => cp._id.toString()),
        ],
      },
      type: RoomType.dm,
      deleted: false,
    });

    if (dm) return res.json(dm);

    const data: WithoutId<IRoom> = {
      orgId: agentProfile.orgId,
      usernames: [
        ...users.map((u) => u.username),
        ...contactProfiles.filter((cp) => !cp.username).map((cp) => cp._id.toString()),
      ],
      agents: agentProfiles.map((ap) => ({
        _id: ap._id,
        username: ap.username,
        userImage: ap.userImage,
        userDisplayName: ap.userDisplayName,
        displayName: ap.displayName,
        image: ap.image,
      })),
      contacts: contactProfiles.map((cp) => ({
        _id: cp._id,
        name: cp.name,
        agentId: cp.agentProfileId,
        agentName: cp.agentName,
        image: cp.image,
        username: cp.username,
        userImage: cp.userImage,
      })),
      creator: user.username,
      type: RoomType.dm,
      dmInitiated: false,
      userStatus: {
        ...users.reduce((obj, u) => {
          const socketIds = u.socketIds;
          return {
            ...obj,
            [u.username]: {
              online: socketIds ? socketIds.length > 0 : false,
              notis: 0,
              unRead: false,
              firstNotiMessage: undefined,
              firstUnReadmessage: undefined,
            },
          };
        }, {}),
        ...contactProfiles
          .filter((cp) => !cp.username)
          .reduce(
            (obj, cp) => ({
              ...obj,
              [cp._id.toString()]: {
                online: false,
                notis: 0,
                unRead: false,
                firstNotiMessage: undefined,
                firstUnReadmessage: undefined,
                socketId: undefined,
              },
            }),
            {}
          ),
      },
      createdAt: getNow(),
      updatedAt: getNow(),
      isPublic: false,
      deleted: false,
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
      deleted: false,
      type: RoomType.channel,
    });
    if (!room) {
      return res.status(404).json({ msg: 'Room not found' });
    }

    const data = { name, updatedAt: getNow() };

    await roomsCol.updateOne({ _id: room._id }, { $set: data });

    // send message in all members
    const users = await usersCol.find({ username: room.usernames }).toArray();
    users.forEach((user) => {
      user.socketIds?.forEach((socketId) => {
        if (io) {
          io.to(socketId).emit(ServerMessageType.channelUpdate, { ...room, ...data });
        }
      });
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

    const rooms = await roomsCol
      .find({
        usernames: user.username,
        // $or: [{ type: RoomType.channel }, { type: RoomType.dm, dmInitiated: true }],
        deleted: false,
      })
      .toArray();

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
    const { agents = [], contacts = [] } = req.body;
    if (agents.length === 0 && contacts.length === 0) {
      return res.status(401).json({ msg: 'Invalid request!' });
    }

    const room = await roomsCol.findOne({
      _id: new ObjectId(roomId),
      orgId: agentProfile.orgId,
      'agents.username': user.username,
      type: RoomType.channel,
      deleted: false,
    });

    if (!room) {
      return res.status(404).json({ msg: 'Room not found' });
    }
    if (room.isPublic) {
      return res.json({});
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
      createdAt: Date.now(),
      updatedAt: Date.now(),
      attachmentIds: [],
      edited: false,
      editable: false,
      mentions: [],
      channels: [],
    };
    const newMessage = await messagesCol.insertOne(msgData);

    const roomData: IRoom = {
      ...room,
      usernames: [...newUsers, ...existingUsers].map((u) => u.username),
      agents: [
        ...room.agents,
        ...filteredAgents.map((ap) => ({
          _id: ap._id,
          username: ap.username,
          userImage: ap.userImage,
          userDisplayName: ap.userDisplayName,
          displayName: ap.displayName,
          image: ap.image,
        })),
      ],
      contacts: [
        ...room.contacts,
        ...filteredContacts.map((cp) => ({
          _id: cp._id,
          name: cp.name,
          username: cp.username!,
          agentId: cp.agentProfileId,
          agentName: cp.agentName,
          userImage: cp.userImage,
          image: cp.image,
        })),
      ],
      userStatus: {
        ...existingUsers.reduce(
          (obj, u) => ({
            ...obj,
            [u.username]: {
              ...room.userStatus[u.username],
              online: u.socketIds ? u.socketIds.length > 0 : false,
              unRead: true,
              firstUnReadmessage: room.userStatus[u.username].firstUnReadmessage || newMessage.insertedId,
            },
          }),
          {}
        ),
        ...newUsers.reduce(
          (obj, u) => ({
            ...obj,
            [u.username]: {
              online: u.socketIds ? u.socketIds.length > 0 : false,
              notis: 1,
              unRead: true,
              firstNotiMessage: newMessage.insertedId,
              firstUnReadmessage: newMessage.insertedId,
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
    newUsers.forEach((u) => {
      u.socketIds?.forEach((socketId) => {
        if (io) {
          io.to(socketId).emit(ServerMessageType.channelJoin, roomData);
        }
      });
    });

    existingUsers.forEach((u) => {
      u.socketIds?.forEach((socketId) => {
        if (io) {
          io.to(socketId).emit(ServerMessageType.channelUpdate, roomData);
        }
      });
    });

    [...newUsers, ...existingUsers].forEach((u) => {
      u.socketIds?.forEach((socketId) => {
        if (io) {
          io.to(socketId).emit(ServerMessageType.msgSend, { ...msgData, _id: newMessage.insertedId, attachments: [] });
        }
      });
    });

    // send email
    newUsers.forEach(async (u) => {
      try {
        const agent = roomData.agents.find((a) => a.username === u.username);
        if (agent) {
          await sendEmail(
            u.emails[0].email,
            'Join new Room',
            undefined,
            `
            <b> Channel Invitation (${agentProfile.org?.name} organization)</b>
            <p>
              You are invited into a new channel ${room.name} by ${user.username}
              Please join <a href="${process.env.WEB_URL}/app/agent-orgs/${agent._id}/rooms/${room._id}" target="_blank">here</a>
            </p>
            `
          );

          // send push notification
          sendPush({
            name: '',
            headings: 'Join new Room',
            subtitle: `Channel Invitation (${agentProfile.org?.name} organization)`,
            contents: `You are invited into a new channel ${room.name} by ${user.username} Please join there`,
            userId: u.username,
            url: `${process.env.SCHEME_APP}:///?navigateTo=app/agent-orgs/${agent._id}/rooms/${room._id}`,
          });

          // send desktop notification
          u.socketIds?.forEach((socketId) => {
            if (io) {
              io.to(socketId).emit(ServerMessageType.electronNotification, {
                title: `Channel Invitation (${agentProfile.org?.name} organization)`,
                body: `You are invited into a new channel ${room.name} by ${user.username} Please join there`,
                url: `${process.env.WEB_URL}/app/agent-orgs/${agent._id}/rooms/${room._id}`,
              });
            }
          });
          return;
        }

        const contact = roomData.contacts.find((c) => c.username === u.username);
        if (contact) {
          await sendEmail(
            u.emails[0].email,
            'Join new Room',
            undefined,
            `
            <b> Channel Invitation (${agentProfile.org?.name} organization)</b>
            <p>
              You are invited into a new channel ${room.name} by ${user.username}
              Please join <a href="${process.env.WEB_URL}/app/contact-orgs/${contact._id}/rooms/${room._id}" target="_blank">here</a>
            </p>
            `
          );

          // send push notification
          sendPush({
            name: '',
            headings: 'Join new Room',
            subtitle: `Channel Invitation (${agentProfile.org?.name} organization)`,
            contents: `You are invited into a new channel ${room.name} by ${user.username} Please join there`,
            userId: u.username,
            url: `${process.env.SCHEME_APP}:///?navigateTo=app/contact-orgs/${contact._id}/rooms/${room._id}`,
          });

          // send desktop notification
          u.socketIds?.forEach((socketId) => {
            if (io) {
              io.to(socketId).emit(ServerMessageType.electronNotification, {
                title: `Channel Invitation (${agentProfile.org?.name} organization)`,
                body: `You are invited into a new channel ${room.name} by ${user.username} Please join there`,
                url: `${process.env.WEB_URL}/app/contact-orgs/${contact._id}/rooms/${room._id}`,
              });
            }
          });
        }
      } catch (error) {
        console.log('sendMessage error ===>', error);
      }
    });

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

export const removeMemberFromRoom = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const agentProfile = req.agentProfile as IAgentProfile;

    const { roomId } = req.params;
    const { agent, contact } = req.body;

    const room = await roomsCol.findOne({
      _id: new ObjectId(roomId),
      orgId: agentProfile.orgId,
      'agents.username': user.username,
      type: RoomType.channel,
      deleted: false,
    });

    if (!room) {
      return res.status(404).json({ msg: 'Room not found' });
    }
    if (room.isPublic) {
      return res.status(400).json({ msg: 'Bad Request. This is public room' });
    }

    const ap = await agentProfilesCol.findOne({
      orgId: agentProfile.orgId,
      username: (agent as IRoomAgent)?.username,
    });
    const cp = await contactsCol.findOne({ _id: (contact as IRoomContact)?._id, orgId: agentProfile.orgId });
    if (!ap && !cp) {
      return res.status(400).json({ msg: 'Invalid request!' });
    }

    const msg = `${(ap || cp)?.username} is removed by ${user.username}`;

    const msgData: WithoutId<IMessage> = {
      roomId: room._id,
      orgId: agentProfile.orgId,
      msg,
      senderName: user.username,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      attachmentIds: [],
      edited: false,
      editable: false,
      mentions: [],
      channels: [],
    };

    const newMessage = await messagesCol.insertOne(msgData);

    const usernames = room.usernames.filter(
      (un) => un !== ap?.username && un !== cp?.username && un !== cp?._id.toString()
    );
    const roomData: IRoom = {
      ...room,
      usernames,
      agents: room.agents.filter((agent) => agent.username !== ap?.username),
      contacts: room.contacts.filter((contact) => !cp || !contact._id.equals(cp._id)),
    };

    await roomsCol.updateOne({ _id: room._id }, { $set: roomData });

    const users = await usersCol.find({ username: { $in: usernames } }).toArray();

    users.forEach((u) => {
      u.socketIds?.forEach((socketId) => {
        if (io) {
          io.to(socketId).emit(ServerMessageType.msgSend, { ...msgData, _id: newMessage.insertedId, attachments: [] });

          io.to(socketId).emit(ServerMessageType.channelUpdate, roomData);
        }
      });
    });

    const removedUser = await usersCol.findOne({ username: (ap || cp)?.username });
    if (removedUser) {
      await sendEmail(
        removedUser.emails[0].email,
        'You are removed from private chatting room',
        undefined,
        `
        <p> You are removed from <b>"${room.name}"</b> room by ${agentProfile.username} in ${agentProfile.org?.name} organization</p>
        `
      );

      removedUser.socketIds?.forEach((socketId) => {
        if (io) {
          io.to(socketId).emit(ServerMessageType.channelArchive, room);

          io.to(socketId).emit(ServerMessageType.electronNotification, {
            title: 'You are removed from private chatting room',
            body: `You are removed from "${room.name}" room by ${agentProfile.username} in ${agentProfile.org?.name} organization`,
          });
        }
      });
    }

    return res.json({ msg: 'success' });
  } catch (error) {
    console.log('removeMemberFromRoom error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const archiveRoom = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const agentProfile = req.agentProfile as IAgentProfile;

    const { roomId } = req.params;

    const room = await roomsCol.findOne({
      _id: new ObjectId(roomId),
      orgId: agentProfile.orgId,
      'agents.username': user.username,
      type: RoomType.channel,
      deleted: false,
    });
    if (!room) {
      return res.status(404).json({ msg: 'Room not found' });
    }

    await roomsCol.updateOne({ _id: room._id }, { $set: { deleted: true } });

    const users = await usersCol.find({ username: { $in: room.usernames } }).toArray();

    users.forEach((u) => {
      u.socketIds?.forEach((socketId) => {
        if (io) {
          io.to(socketId).emit(ServerMessageType.channelArchive, room);
        }
      });
    });

    return res.json({ msg: 'success' });
  } catch (error) {
    console.log('archiveRoom error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
