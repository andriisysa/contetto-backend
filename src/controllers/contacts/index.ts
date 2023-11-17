import type { Request, Response } from 'express';
import { ObjectId, WithoutId } from 'mongodb';

import { db } from '@/database';

import { IUser } from '@/types/user.types';
import { IAgentProfile } from '@/types/agentProfile.types';
import { IContact } from '@/types/contact.types';

const agentProfilesCol = db.collection<WithoutId<IAgentProfile>>('agentProfiles');
const contactsCol = db.collection<WithoutId<IContact>>('contacts');

export const create = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const agentProfile = req.agentProfile as IAgentProfile;


    return res.json({ msg: 'sent invitation' });
  } catch (error) {
    console.log('org invite ===>', error);
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


export const getOne = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    return res.json({});
  } catch (error) {
    console.log('myContacts error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
   
    return res.json({});
  } catch (error) {
    console.log('myContacts error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const deleteOne = async (req: Request, res: Response) => {
  try {
   
    return res.json({});
  } catch (error) {
    console.log('myContacts error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const invite = async (req: Request, res: Response) => {
  try {
   
    return res.json({});
  } catch (error) {
    console.log('myContacts error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};