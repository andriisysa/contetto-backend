import type { Request, Response } from 'express';
import { ObjectId, WithoutId } from 'mongodb';

import { db } from '@/database';

import { IUser } from '@/types/user.types';
import { IAgentProfile } from '@/types/agentProfile.types';
import { IContact } from '@/types/contact.types';
import { getNow, getRandomString } from '@/utils';

const contactsCol = db.collection<WithoutId<IContact>>('contacts');

export const createContact = async (req: Request, res: Response) => {
  try {
    const agentProfile = req.agentProfile as IAgentProfile;

    const { name, note = '' } = req.body;

    const data: WithoutId<IContact> = {
      name,
      note,
      orgId: agentProfile.orgId,
      agentProfileId: agentProfile._id,
      agentName: agentProfile.username,
      createdAt: getNow(),
      updatedAt: getNow(),
    };

    const newContact = await contactsCol.insertOne(data);

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
    if (user.username !== contact.username || user.username !== contact.agentName) {
      return res.status(404).json({ msg: 'No contact found' });
    }

    return res.json({ ...contact, note: user.username === contact.agentName ? contact.note : '' });
  } catch (error) {
    console.log('getContact error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const updateContact = async (req: Request, res: Response) => {
  try {
    const agentProfile = req.agentProfile as IAgentProfile;
    const { contactId } = req.params;
    const { name, note = '' } = req.body;

    const contact = await contactsCol.findOne({
      _id: new ObjectId(contactId),
      agentProfileId: agentProfile._id,
    });
    if (!contact) {
      return res.status(404).json({ msg: 'No contact found' });
    }

    const data: Partial<IContact> = {
      name,
      note,
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
      link: `${process.env.WEB_URL}/invitations/${agentProfile.orgId}/contacts/${contactId}/share?inviteCode=${inviteCode}`,
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

    // bind user
    await contactsCol.updateOne({ _id: contact._id }, { $set: { username: user.username } });

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
