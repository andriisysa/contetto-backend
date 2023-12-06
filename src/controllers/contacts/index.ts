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

const contactsCol = db.collection<WithoutId<IContact>>('contacts');
const contactNotesCol = db.collection<WithoutId<IContactNote>>('contactNotes');
const searchResultsCol = db.collection<WithoutId<ISearchResult>>('searchResults');

export const createContact = async (req: Request, res: Response) => {
  try {
    const agentProfile = req.agentProfile as IAgentProfile;

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
          $lookup: {
            from: 'contactNotes',
            localField: '_id',
            foreignField: 'contactId',
            as: 'notes',
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

    return res.json({ ...contact, notes: user.username === contact.agentName ? contact.notes : [] });
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
