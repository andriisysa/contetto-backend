import type { Request, Response } from 'express';
import { WithoutId } from 'mongodb';

import { db } from '@/database';

import { IOrg } from '@/types/org.types';

const orgsCol = db.collection<WithoutId<IOrg>>('orgs');

export const getOrgs = async (req: Request, res: Response) => {
  try {
    const orgs = orgsCol.find().toArray();

    return res.json(orgs);
  } catch (error) {
    console.log('admin getOrgs ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
