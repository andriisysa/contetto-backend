import type { Request, Response } from 'express';
import { ObjectId, WithoutId } from 'mongodb';

import { db } from '@/database';

import { IOrg } from '@/types/org.types';

const orgsCol = db.collection<WithoutId<IOrg>>('orgs');

export const getOrgs = async (req: Request, res: Response) => {
  try {
    const orgs = await orgsCol.find().toArray();

    return res.json(orgs);
  } catch (error) {
    console.log('admin getOrgs ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getOrg = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const org = await orgsCol.findOne({ _id: new ObjectId(id) });
    if (!org) {
      return res.status(404).json({ msg: 'Not found org' });
    }

    return res.json(org);
  } catch (error) {
    console.log('admin getOrg ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
