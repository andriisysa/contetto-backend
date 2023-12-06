import type { Request, Response } from 'express';
import { ObjectId, WithoutId } from 'mongodb';

import { db } from '@/database';

import { getNow, getRandomString } from '@/utils';
import { sendEmail } from '@/utils/email';
import { IOrg } from '@/types/org.types';
import { IUser } from '@/types/user.types';
import { AgentRole, IAgentProfile, roleOrder } from '@/types/agentProfile.types';
import { IInvite } from '@/types/invite.types';
import { IContact } from '@/types/contact.types';
import { getImageExtension } from '@/utils/extension';
import { uploadBase64ToS3 } from '@/utils/s3';

const orgsCol = db.collection<WithoutId<IOrg>>('orgs');
const agentProfilesCol = db.collection<WithoutId<IAgentProfile>>('agentProfiles');
const invitesCol = db.collection<WithoutId<IInvite>>('invites');
const contactsCol = db.collection<WithoutId<IContact>>('contacts');

export const createOrg = async (user: IUser, orgData: WithoutId<IOrg>) => {
  const newOrg = await orgsCol.insertOne(orgData);
  const newAgent = await agentProfilesCol.insertOne({
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
  return { newOrg, newAgent };
};

export const create = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    let { name, logoUrl = '', logoFileType, mlsFeeds = [] } = req.body;

    if (logoUrl && logoFileType) {
      const imageExtension = getImageExtension(logoFileType);
      if (!imageExtension) {
        return res.status(400).json({ msg: 'Invalid image type' });
      }

      logoUrl = await uploadBase64ToS3('orgs', String(name).split(' ')[0], logoUrl, logoFileType, imageExtension);
    }

    const orgData: WithoutId<IOrg> = {
      name,
      owner: user.username,
      logoUrl,
      mlsFeeds,
      deleted: false,
    };

    const { newOrg, newAgent } = await createOrg(user, orgData);

    return res.json({ orgId: newOrg.insertedId, agentProfileId: newAgent.insertedId });
  } catch (error) {
    console.log('Organization create error===>', error);
    return res.status(500).json({ msg: 'Organization create failed' });
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    const { id: orgId } = req.params;

    const org = await orgsCol.findOne({ _id: new ObjectId(orgId), deleted: false });
    if (!org) {
      return res.status(400).json({ msg: 'Organization does not exist' });
    }

    let {
      name,
      logoUrl,
      logoFileType,
      sidebarFontColor = '',
      sidebarBgColor = '',
      fontFamily = '',
      mlsFeeds = [],
    } = req.body;

    if (logoUrl && logoFileType) {
      const imageExtension = getImageExtension(logoFileType);
      if (!imageExtension) {
        return res.status(400).json({ msg: 'Invalid image type' });
      }

      logoUrl = await uploadBase64ToS3('orgs', String(name).split(' ')[0], logoUrl, logoFileType, imageExtension);
    }

    await orgsCol.updateOne(
      { _id: org._id },
      {
        $set: {
          name,
          logoUrl,
          sidebarFontColor,
          sidebarBgColor,
          fontFamily,
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

    return res.json({ org, agentProfile: req.agentProfile });
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
    await contactsCol.deleteMany({ orgId: new ObjectId(orgId) });

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

    const invite = await invitesCol.findOne({
      email,
      orgId: agentProfile.orgId,
      used: false,
      createdAt: { $gte: getNow() - 2 * 3600 }, // check expiry time
    });

    const code = getRandomString(10);

    await sendEmail(
      email,
      'Confirm email',
      undefined,
      `
        <p>You are invited to ${agentProfile.org?.name} by ${user.username}. Here's the
        <a href="${process.env.WEB_URL}/invitations/${agentProfile.orgId}?code=${code}" target="_blank">link</a>
        It will be expired in 2 hours.
        </p>
      `
    );

    const data: WithoutId<IInvite> = {
      email,
      code,
      invitorId: agentProfile._id,
      invitor: user.username,
      orgId: agentProfile.orgId,
      used: false,
      createdAt: getNow(),
      role,
    };
    if (invite) {
      await invitesCol.updateOne({ _id: invite._id }, { $set: data });
    } else {
      await invitesCol.insertOne(data);
    }

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

    if (invite.createdAt + 2 * 3600 < getNow()) {
      return res.status(400).json({ msg: 'Invite code expired' });
    }

    const org = await orgsCol.findOne({ _id: new ObjectId(orgId), deleted: false });
    if (!org) {
      return res.status(404).json({ msg: 'No organization found' });
    }

    // check already exists
    const agent = await agentProfilesCol.findOne({ username: user.username, orgId: org._id });
    if (agent) {
      return res.status(400).json({ msg: 'You already accepted invitation' });
    }

    const data: WithoutId<IAgentProfile> = {
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
    };

    const newAgent = await agentProfilesCol.insertOne(data);

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

    return res.json({ ...data, _id: newAgent.insertedId });
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

    const invitations = await invitesCol
      .find({
        orgId: new ObjectId(orgId),
        used: false,
        createdAt: { $gte: getNow() - 2 * 3600 }, // check expiry time
      })
      .toArray();

    return res.json({ members, invitations });
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
    await contactsCol.deleteMany({ orgId: tagetUserProfile.orgId, agentProfileId: tagetUserProfile._id });

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
    await contactsCol.deleteMany({ orgId: agentProfile.orgId, agentProfileId: agentProfile._id });

    return res.json({ msg: 'You left' });
  } catch (error) {
    console.log('leaveOrg error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
