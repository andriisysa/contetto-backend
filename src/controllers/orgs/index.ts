import type { Request, Response } from 'express';
import { ObjectId, WithoutId } from 'mongodb';

import { db } from '@/database';

import { getNow, getRandomString } from '@/utils';
import { sendEmail } from '@/utils/email';
import { IOrg } from '@/types/org.types';
import { IUser } from '@/types/user.types';
import { AgentRole, IAgentProfile, roleOrder } from '@/types/agentProfile.types';
import { IInvite, InviteType } from '@/types/invite.types';
import { IContact } from '@/types/contact.types';

const orgsCol = db.collection<WithoutId<IOrg>>('orgs');
const agentProfilesCol = db.collection<WithoutId<IAgentProfile>>('agentProfiles');
const invitesCol = db.collection<WithoutId<IInvite>>('invites');
const contactsCol = db.collection<WithoutId<IContact>>('contacts');

export const createOrg = async (user: IUser, orgData: WithoutId<IOrg>) => {
  const newOrg = await orgsCol.insertOne(orgData);
  await agentProfilesCol.insertOne({
    orgId: newOrg.insertedId,
    username: user.username,
    email: String(user.emails.find((email) => email.primary)?.email),
    phone: '',
    description: `Owner of ${orgData.name}`,
    role: AgentRole.owner,
    deleted: false,
    createdAt: getNow(),
    updatedAt: getNow(),
  });
};

export const create = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const { name, primaryColor, secondaryColor, logoUrl, mlsFeeds = [] } = req.body;

    const orgData: WithoutId<IOrg> = {
      name,
      owner: user.username,
      primaryColor,
      secondaryColor,
      logoUrl,
      mlsFeeds,
      deleted: false,
    };

    await createOrg(user, orgData);

    return res.json({ msg: 'Organization is created!' });
  } catch (error) {
    console.log('Organization create error===>', error);
    return res.status(500).json({ msg: 'Organization create failed' });
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
    return res.status(500).json({ msg: 'Organization update error' });
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
    console.log('org getOne ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const deleteOne = async (req: Request, res: Response) => {
  try {
    const { id: orgId } = req.params;
    const org = await orgsCol.findOne({ _id: new ObjectId(orgId), deleted: false });
    if (!org) {
      return res.status(400).json({ msg: 'Organization does not exist' });
    }

    await orgsCol.updateOne({ _id: new ObjectId(orgId) }, { $set: { deleted: true, deletedAt: getNow() } });

    // Todo: delete all agentProfiles and contacts
    await agentProfilesCol.updateMany({ orgId: new ObjectId(orgId) }, { $set: { deleted: true, deletedAt: getNow() } });
    await contactsCol.updateMany({ orgId: new ObjectId(orgId) }, { $set: { deleted: true, deletedAt: getNow() } });

    return res.json({ msg: 'Organization deleted!' });
  } catch (error) {
    console.log('org deleteOne ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const inviteAgent = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const agentProfile = req.agentProfile as IAgentProfile;

    const { email, role } = req.body;
    if (!roleOrder[String(role) as AgentRole] || roleOrder[agentProfile.role] >= roleOrder[String(role) as AgentRole]) {
      return res.status(400).json({ msg: `You don't have permission to invite ${role} role` });
    }

    const code = getRandomString(10);
    await sendEmail(
      email,
      'Confirm email',
      undefined,
      `
        <p>You are invited to ${agentProfile.org?.name} by ${user.username}. Here's the
        <a href="https://ava.com/orgs/${agentProfile.orgId}/invites?code=${code}" target="_blank">link</a>
        It will be expired in 2 hours.
        </p>
      `
    );

    await invitesCol.insertOne({
      code,
      bindType: InviteType.org,
      bindId: agentProfile._id,
      invitor: user.username,
      orgId: agentProfile.orgId,
      used: false,
      createdAt: getNow(),
      role,
    });

    return res.json({ msg: 'sent invitation' });
  } catch (error) {
    console.log('org invite ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const inviteContact = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const agentProfile = req.agentProfile as IAgentProfile;

    const { email } = req.body;

    const code = getRandomString(10);
    await sendEmail(
      email,
      'Confirm email',
      undefined,
      `
        <p>You are invited to ${agentProfile.org?.name} by ${user.username}. Here's the
        <a href="https://ava.com/orgs/${agentProfile.orgId}/invites?code=${code}" target="_blank">link</a>
        It will be expired in 2 hours.
        </p>
      `
    );

    await invitesCol.insertOne({
      code,
      bindType: InviteType.contact,
      bindId: agentProfile._id,
      invitor: user.username,
      orgId: agentProfile.orgId,
      used: false,
      createdAt: getNow(),
    });

    return res.json({ msg: 'sent invitation' });
  } catch (error) {
    console.log('org invite ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const acceptInvite = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const { code } = req.body;
    const { id: orgId } = req.params;

    const invite = await invitesCol.findOne({
      orgId: new ObjectId(orgId),
      code,
      used: false,
    });
    if (!invite) {
      return res.status(404).json({ msg: 'Invite code invalid' });
    }

    const org = await orgsCol.findOne({ _id: new ObjectId(orgId), deleted: false });
    if (!org) {
      return res.status(404).json({ msg: 'No organization found' });
    }

    if (invite.bindType === InviteType.org) {
      await agentProfilesCol.insertOne({
        username: user.username,
        orgId: org._id,
        email: user.emails[0].email,
        phone: '',
        description: '',
        invitor: invite.invitor,
        role: invite.role as AgentRole,
        deleted: false,
        createdAt: getNow(),
        updatedAt: getNow(),
      });
    } else if (invite.bindType === InviteType.contact) {
      await contactsCol.insertOne({
        username: user.username,
        email: user.emails[0].email,
        orgId: org._id,
        agentProfileId: invite.bindId,
        invitor: invite.invitor,
        createdAt: getNow(),
        updatedAt: getNow(),
        deleted: false,
      });
    }

    await invitesCol.updateOne(
      { _id: invite._id },
      {
        $set: {
          used: true,
          usedBy: user.username,
          usedAt: getNow(),
        },
      }
    );

    return res.json({ msg: 'Accepted' });
  } catch (error) {
    console.log('org accept invite ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getMyOrgs = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const agentProfiles = await agentProfilesCol
      .aggregate<IAgentProfile>([
        {
          $match: {
            username: user.username,
            deleted: false,
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
          $unwind: {
            path: '$org',
          },
        },
      ])
      .toArray();

    const contacts = await contactsCol
      .aggregate<IContact>([
        {
          $match: {
            username: user.username,
            deleted: false,
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

    return res.json({ agentProfiles, contacts });
  } catch (error) {
    console.log('getMyOrgs ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getOrgMembers = async (req: Request, res: Response) => {
  try {
    const { id: orgId } = req.params;
    const members = await agentProfilesCol.find({ orgId: new ObjectId(orgId), deleted: false }).toArray();

    return res.json(members);
  } catch (error) {
    console.log('getOrgMembers error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const removeMember = async (req: Request, res: Response) => {
  try {
    const agentProfile = req.agentProfile as IAgentProfile;
    const { username: tagetUsername } = req.body;

    const tagetUserProfile = await agentProfilesCol.findOne({
      orgId: agentProfile.orgId,
      username: tagetUsername,
      deleted: false,
    });
    if (!tagetUserProfile) {
      return res.status(404).json({ msg: 'No user to remove' });
    }

    if (roleOrder[agentProfile.role] >= roleOrder[tagetUserProfile.role]) {
      return res.status(400).json({ msg: `You don't have permission to remove this user` });
    }

    await agentProfilesCol.updateOne({ _id: tagetUserProfile._id }, { $set: { deleted: true, deletedAt: getNow() } });
    await contactsCol.updateMany(
      { orgId: tagetUserProfile.orgId, agentProfileId: tagetUserProfile._id },
      { $set: { deleted: true, deletedAt: getNow() } }
    );

    return res.json({ msg: 'removed!' });
  } catch (error) {
    console.log('removeMember error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const leaveOrg = async (req: Request, res: Response) => {
  try {
    const agentProfile = req.agentProfile as IAgentProfile;

    await agentProfilesCol.updateOne({ _id: agentProfile._id }, { $set: { deleted: true, deletedAt: getNow() } });
    await contactsCol.updateMany(
      { orgId: agentProfile.orgId, agentProfileId: agentProfile._id },
      { $set: { deleted: true, deletedAt: getNow() } }
    );

    return res.json({ msg: 'You left' });
  } catch (error) {
    console.log('leaveOrg error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};