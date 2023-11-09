import type { Request, Response } from 'express';
import { randomInt } from 'crypto';
import { ObjectId, WithoutId } from 'mongodb';

import { db } from '@/database';

import { getNow } from '@/utils';
import { sendEmail } from '@/utils/email';
import { IOrg } from '@/types/org.types';
import { IUser } from '@/types/user.types';
import { AgentRole, IAgentProfile } from '@/types/agentProfile.types';

const orgsCol = db.collection<WithoutId<IOrg>>('orgs');
const agentProfilesCol = db.collection<WithoutId<IAgentProfile>>('agentProfiles');

export const create = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const { name, primaryColor, secondaryColor, logoUrl, mlsFeeds = [] } = req.body;

    const org = await orgsCol.findOne({ name, owner: user.username });
    if (org) {
      return res.status(400).json({ msg: 'Organization name already exists' });
    }

    const orgData: WithoutId<IOrg> = {
      name,
      owner: user.username,
      primaryColor,
      secondaryColor,
      logoUrl,
      mlsFeeds,
      deleted: false,
    };

    const newOrg = await orgsCol.insertOne(orgData);
    await agentProfilesCol.insertOne({
      orgId: newOrg.insertedId,
      username: user.username,
      email: String(user.emails.find((email) => email.primary)?.email),
      phone: '',
      description: `Owner of ${name}`,
      role: AgentRole.owner,
      deleted: false,
    });

    return res.json({ msg: 'Organization is created!' });
  } catch (error) {
    console.log('Organization create error===>', error);
    return res.status(400).json({ msg: 'Organization create failed' });
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    const { id: orgId } = req.params;

    const { name, primaryColor, secondaryColor, logoUrl, mlsFeeds = [] } = req.body;

    const org = await orgsCol.findOne({ _id: new ObjectId(orgId), deleted: false });
    if (!org) {
      return res.status(400).json({ msg: 'Organization does not exist' });
    }

    await orgsCol.updateOne(
      { _id: org._id },
      {
        $set: {
          name,
          primaryColor,
          secondaryColor,
          logoUrl,
          mlsFeeds,
        },
      }
    );

    return res.json({ msg: 'Updated!' });
  } catch (error) {
    console.log('org update error ===>', error);
    return res.status(400).json({ msg: 'Organization update error' });
  }
};

export const getOne = async (req: Request, res: Response) => {
  try {
    const { id: orgId } = req.params;
    const org = await orgsCol.findOne({ _id: new ObjectId(orgId), deleted: false });
    if (!org) {
      return res.status(400).json({ msg: 'Organization does not exist' });
    }

    return res.json(org);
  } catch (error) {
    console.log('login ===>', error);
    return res.status(400).json({ msg: 'login failed' });
  }
};

export const deleteOne = async (req: Request, res: Response) => {
  try {
    const { id: orgId } = req.params;
    const org = await orgsCol.findOne({ _id: new ObjectId(orgId), deleted: false });
    if (!org) {
      return res.status(400).json({ msg: 'Organization does not exist' });
    }

    await orgsCol.updateOne({ _id: new ObjectId(orgId) }, { $set: { deleted: true } });

    return res.json({ msg: 'Organization deleted!' });
  } catch (error) {
    console.log('login ===>', error);
    return res.status(400).json({ msg: 'login failed' });
  }
};

export const invite = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    return res.status(404).json({ msg: 'user not found' });
  } catch (error) {
    console.log('login ===>', error);
    return res.status(400).json({ msg: 'login failed' });
  }
};

export const acceptInvite = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    return res.status(404).json({ msg: 'user not found' });
  } catch (error) {
    console.log('login ===>', error);
    return res.status(400).json({ msg: 'login failed' });
  }
};
