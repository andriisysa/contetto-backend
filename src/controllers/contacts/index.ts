import type { Request, Response } from 'express';
import { ObjectId, WithoutId } from 'mongodb';

import { db } from '@/database';

import { IUser } from '@/types/user.types';
import { IAgentProfile } from '@/types/agentProfile.types';
import { IContact, IContactNote } from '@/types/contact.types';
import { getNow, getRandomString } from '@/utils';
import { ISearchResult } from '@/types/search.types';
import { getImageExtension } from '@/utils/extension';
import { uploadBase64ToS3 } from '@/utils/s3';
import { IRoom, RoomType } from '@/types/room.types';
import { io } from '@/socketServer';
import { ServerMessageType } from '@/types/message.types';

const usersCol = db.collection<WithoutId<IUser>>('users');
const contactsCol = db.collection<WithoutId<IContact>>('contacts');
const contactNotesCol = db.collection<WithoutId<IContactNote>>('contactNotes');
const searchResultsCol = db.collection<WithoutId<ISearchResult>>('searchResults');
const roomsCol = db.collection<WithoutId<IRoom>>('rooms');

export const createContact = async (req: Request, res: Response) => {
  try {
    const agentProfile = req.agentProfile as IAgentProfile;
    const user = await usersCol.findOne({ username: agentProfile.username });
    if (!user) {
      return res.status(400).json({ msg: 'not found user' });
    }

    let { name, email, phone, image, imageFileType, note = '' } = req.body;

    if (image && imageFileType) {
      const imageExtension = getImageExtension(imageFileType);
      if (!imageExtension) {
        return res.status(400).json({ msg: 'Invalid image type' });
      }

      image = await uploadBase64ToS3('contacts', String(name).split(' ')[0], image, imageFileType, imageExtension);
    }

    const data: WithoutId<IContact> = {
      name,
      email,
      phone,
      image,
      orgId: agentProfile.orgId,
      agentProfileId: agentProfile._id,
      agentName: agentProfile.username,
      createdAt: getNow(),
      updatedAt: getNow(),
    };

    const newContact = await contactsCol.insertOne(data);

    if (note) {
      await contactNotesCol.insertOne({
        contactId: newContact.insertedId,
        note,
        timestamp: getNow(),
      });
    }

    // create dm with this contact
    const roomData: WithoutId<IRoom> = {
      orgId: agentProfile.orgId,
      usernames: [agentProfile.username, newContact.insertedId.toString()],
      agents: [
        {
          _id: agentProfile._id,
          username: agentProfile.username,
        },
      ],
      contacts: [
        {
          _id: newContact.insertedId,
          name: name,
          agentId: agentProfile._id,
          agentName: agentProfile.username,
        },
      ],
      creator: agentProfile.username,
      type: RoomType.dm,
      dmInitiated: false,
      userStatus: {
        [user.username]: {
          online: !!user.socketId,
          notis: 0,
          unRead: false,
          firstNotiMessage: undefined,
          firstUnReadmessage: undefined,
          socketId: user.socketId,
        },
        [newContact.insertedId.toString()]: {
          online: false,
          notis: 0,
          unRead: false,
          firstNotiMessage: undefined,
          firstUnReadmessage: undefined,
        },
      },
      createdAt: getNow(),
      updatedAt: getNow(),
      deleted: false,
    };
    const newRoom = await roomsCol.insertOne(roomData);

    if (io && user.socketId) {
      io.to(user.socketId).emit(ServerMessageType.dmCreate, { ...roomData, _id: newRoom.insertedId });
    }

    return res.json({ ...data, _id: newContact.insertedId });
  } catch (error) {
    console.log('createContact error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const myContacts = async (req: Request, res: Response) => {
  try {
    const agentProfile = req.agentProfile as IAgentProfile;

    const contacts = await contactsCol.find({ agentProfileId: agentProfile._id }).toArray();
    return res.json(contacts);
  } catch (error) {
    console.log('myContacts error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getContact = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const { id: orgId, contactId } = req.params;

    const contacts = await contactsCol
      .aggregate<IContact>([
        {
          $match: {
            _id: new ObjectId(contactId),
            orgId: new ObjectId(orgId),
          },
        },
        {
          $lookup: {
            from: 'orgs',
            localField: 'orgId',
            foreignField: '_id',
            as: 'org',
          },
        },
        {
          $lookup: {
            from: 'agentProfiles',
            localField: 'agentProfileId',
            foreignField: '_id',
            as: 'agent',
          },
        },
        {
          $unwind: {
            path: '$org',
          },
        },
        {
          $unwind: {
            path: '$agent',
          },
        },
      ])
      .toArray();

    if (contacts.length === 0) {
      return res.status(404).json({ msg: 'No contact found' });
    }

    const contact = contacts[0];
    if (user.username !== contact.username && user.username !== contact.agentName) {
      return res.status(404).json({ msg: 'No contact found' });
    }

    return res.json(contact);
  } catch (error) {
    console.log('getContact error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const updateContact = async (req: Request, res: Response) => {
  try {
    const agentProfile = req.agentProfile as IAgentProfile;
    const { contactId } = req.params;
    let { name, email, phone, image, imageFileType } = req.body;

    if (image && imageFileType) {
      const imageExtension = getImageExtension(imageFileType);
      if (!imageExtension) {
        return res.status(400).json({ msg: 'Invalid image type' });
      }

      image = await uploadBase64ToS3('contacts', String(name).split(' ')[0], image, imageFileType, imageExtension);
    }

    const contact = await contactsCol.findOne({
      _id: new ObjectId(contactId),
      agentProfileId: agentProfile._id,
    });
    if (!contact) {
      return res.status(404).json({ msg: 'No contact found' });
    }

    const data: Partial<IContact> = {
      name,
      email,
      phone,
      image,
    };

    await contactsCol.updateOne({ _id: contact._id }, { $set: data });

    return res.json({ ...contact, data });
  } catch (error) {
    console.log('updateContact error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const deleteContact = async (req: Request, res: Response) => {
  try {
    const agentProfile = req.agentProfile as IAgentProfile;
    const { contactId } = req.params;

    const contact = await contactsCol.findOne({
      _id: new ObjectId(contactId),
      agentProfileId: agentProfile._id,
    });
    if (!contact) {
      return res.status(404).json({ msg: 'No contact found' });
    }

    await contactsCol.deleteOne({ _id: contact._id });
    await contactNotesCol.deleteMany({ contactId: contact._id });
    await searchResultsCol.updateMany(
      {
        orgId: contact.orgId,
        // agentProfileId: contact.agentProfileId,
        contactId: contact._id,
      },
      {
        $set: { savedForAgent: true },
        $unset: {
          contactId: '',
        },
      }
    );
    // archive dm
    await roomsCol.updateMany({ type: RoomType.dm, 'contacts._id': contact._id }, { $set: { deleted: true } });

    return res.json({ msg: 'deleted' });
  } catch (error) {
    console.log('deleteContact error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const shareContact = async (req: Request, res: Response) => {
  try {
    const agentProfile = req.agentProfile as IAgentProfile;
    const { contactId } = req.params;

    const contact = await contactsCol.findOne({
      _id: new ObjectId(contactId),
      agentProfileId: agentProfile._id,
    });

    if (!contact) {
      return res.status(404).json({ msg: 'No contact found' });
    }
    if (contact.username) {
      return res.status(400).json({ msg: `Contact is already binded to a user ${contact.username}` });
    }

    const inviteCode = getRandomString(10);
    await contactsCol.updateOne({ _id: contact._id }, { $set: { inviteCode } });

    return res.json({
      link: `${process.env.WEB_URL}/invitations/${agentProfile.orgId}/contacts/${contactId}?inviteCode=${inviteCode}`,
    });
  } catch (error) {
    console.log('shareContact error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const bindContact = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const { contactId } = req.params;
    const { inviteCode } = req.body;

    const contact = await contactsCol.findOne({
      _id: new ObjectId(contactId),
    });

    if (!contact) {
      return res.status(404).json({ msg: 'No contact found' });
    }
    if (contact.username) {
      return res.status(400).json({ msg: `Contact is already binded to a user ${contact.username}` });
    }
    if (contact.inviteCode !== inviteCode) {
      return res.status(400).json({ msg: 'Invalide code' });
    }

    const existingContact = await contactsCol.findOne({
      orgId: contact.orgId,
      agentProfileId: contact.agentProfileId,
      username: user.username,
    });
    if (existingContact) {
      return res.status(400).json({ msg: `This user is already binded to a contact ${existingContact.name}` });
    }

    // bind user
    await contactsCol.updateOne(
      { _id: contact._id },
      {
        $set: {
          username: user.username,
          userEmail: user.emails[0].email,
          userPhone: user.phones ? user.phones[0].phone : undefined,
          userImage: user.image,
          email: contact.email || user.emails[0].email,
          phone: contact.phone || (user.phones ? user.phones[0].phone : undefined),
          image: contact.image || user.image,
        },
      }
    );

    // update dm
    const rooms = await roomsCol.find({ 'contacts._id': contact._id }).toArray();
    for (const room of rooms) {
      // TODO: check duplicated rooms
      const updateData = {
        usernames: [...room.usernames.filter((un) => un !== contact._id.toString()), user.username],
        contacts: [
          ...room.contacts.filter((c) => c._id.toString() !== contact._id.toString()),
          {
            _id: contact._id,
            name: contact.name,
            agentId: contact.agentProfileId,
            agentName: contact.agentName,
            username: user.username,
          },
        ],
        userStatus: {
          ...room.userStatus,
          [user.username]: {
            ...room.userStatus[contact._id.toString()],
            online: !!user.socketId,
            socketId: user.socketId,
          },
        },
      };
      await roomsCol.updateOne(
        { _id: room._id },
        {
          $set: updateData,
        }
      );

      if (io && user.socketId) {
        io.to(user.socketId).emit(ServerMessageType.channelUpdate, { ...room, ...updateData });
      }
    }

    return res.json({ ...contact, username: user.username });
  } catch (error) {
    console.log('bindContact error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const searchContacts = async (req: Request, res: Response) => {
  try {
    const agentProfile = req.agentProfile as IAgentProfile;
    const { search } = req.query;

    const contacts = await contactsCol
      .find({
        agentProfileId: agentProfile._id,
        ...(search
          ? {
              $or: [
                {
                  name: {
                    $regex: String(search).replace(/[-[\]{}()*+?.,\\/^$|#\s]/g, '\\$&'),
                    $options: 'i',
                  },
                },
                {
                  username: {
                    $regex: String(search).replace(/[-[\]{}()*+?.,\\/^$|#\s]/g, '\\$&'),
                    $options: 'i',
                  },
                },
              ],
            }
          : {}),
      })
      .toArray();

    return res.json(contacts);
  } catch (error) {
    console.log('searchContacts error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const createNote = async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;
    const { note } = req.body;

    await contactNotesCol.insertOne({
      note,
      contactId: new ObjectId(contactId),
      timestamp: getNow(),
    });

    return res.json({ msg: 'Created a note' });
  } catch (error) {
    console.log('createNote error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const updateNote = async (req: Request, res: Response) => {
  try {
    const { contactId, noteId } = req.params;
    const { note } = req.body;

    const existing = await contactNotesCol.findOne({ _id: new ObjectId(noteId), contactId: new ObjectId(contactId) });
    if (!existing) {
      return res.status(404).json({ msg: 'Note not found' });
    }

    await contactNotesCol.updateOne(
      { _id: new ObjectId(noteId), contactId: new ObjectId(contactId) },
      { $set: { note, timestamp: getNow() } }
    );
    return res.json({ msg: 'Updated' });
  } catch (error) {
    console.log('updateNote error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getNotes = async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;

    const notes = await contactNotesCol
      .find({ contactId: new ObjectId(contactId) })
      .sort({ timestamp: -1 })
      .toArray();

    return res.json(notes);
  } catch (error) {
    console.log('getNotes error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const deleteNote = async (req: Request, res: Response) => {
  try {
    const { contactId, noteId } = req.params;

    const existing = await contactNotesCol.findOne({ _id: new ObjectId(noteId), contactId: new ObjectId(contactId) });
    if (!existing) {
      return res.status(404).json({ msg: 'Note not found' });
    }

    await contactNotesCol.deleteOne({ _id: new ObjectId(noteId), contactId: new ObjectId(contactId) });

    return res.json({ msg: 'Deleted' });
  } catch (error) {
    console.log('getNotes error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
