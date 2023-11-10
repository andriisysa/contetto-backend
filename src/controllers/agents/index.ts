import type { Request, Response } from 'express';
import { ObjectId, WithoutId } from 'mongodb';

import { db } from '@/database';

import { IUser } from '@/types/user.types';
import { IAgentProfile } from '@/types/agentProfile.types';
import { IContact } from '@/types/contact.types';

const agentProfilesCol = db.collection<WithoutId<IAgentProfile>>('agentProfiles');
const contactsCol = db.collection<WithoutId<IContact>>('contacts');

export const getOne = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const { id: agentProfileId } = req.params;

    const agentProfile = await agentProfilesCol.findOne({ _id: new ObjectId(agentProfileId), deleted: false });
    if (!agentProfile) {
      return res.status(404).json({ msg: 'No agent' });
    }

    // check user is the same
    if (user.username !== agentProfile.username) {
      // check if a user is an agent in this org
      const agent = await agentProfilesCol.findOne({ orgId: agentProfile.orgId, username: user.username });
      if (!agent) {
        // check if a user is a contract of this agent
        const contact = await contactsCol.findOne({
          orgId: agentProfile.orgId,
          agentProfileId: agentProfile._id,
          username: user.username,
        });
        if (!contact) {
          return res.status(400).json({ msg: "You don't have permission" });
        }
      }
    }

    return res.json(agentProfile);
  } catch (error) {
    console.log('agent getOne error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const myContacts = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const { id: agentProfileId } = req.params;

    const agentProfile = await agentProfilesCol.findOne({
      _id: new ObjectId(agentProfileId),
      username: user.username,
      deleted: false,
    });
    if (!agentProfile) {
      return res.status(400).json({ msg: "You don't have permission" });
    }

    const contacts = await contactsCol.find({ agentProfileId: new ObjectId(agentProfileId) }).toArray();
    return res.json(contacts);
  } catch (error) {
    console.log('myContacts error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
