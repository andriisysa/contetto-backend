import type { Request, Response } from 'express';
import { ObjectId, WithoutId } from 'mongodb';

import { db } from '@/database';

import { getNow, getRandomString } from '@/utils';
import { sendEmail } from '@/utils/email';
import { DefaultOrgTheme, IOrg, IOrgBrand } from '@/types/org.types';
import { IUser } from '@/types/user.types';
import { AgentRole, IAgentProfile, roleOrder } from '@/types/agentProfile.types';
import { IInvite } from '@/types/invite.types';
import { IContact } from '@/types/contact.types';
import { getImageExtension } from '@/utils/extension';
import { uploadBase64ToS3 } from '@/utils/s3';
import { IIndustry } from '@/types/industry.types';
import { IRoom, RoomType } from '@/types/room.types';
import { io } from '@/socketServer';
import { ServerMessageType } from '@/types/message.types';

const orgsCol = db.collection<WithoutId<IOrg>>('orgs');
const agentProfilesCol = db.collection<WithoutId<IAgentProfile>>('agentProfiles');
const invitesCol = db.collection<WithoutId<IInvite>>('invites');
const contactsCol = db.collection<WithoutId<IContact>>('contacts');
const industriesCol = db.collection<WithoutId<IIndustry>>('industries');
const roomsCol = db.collection<WithoutId<IRoom>>('rooms');
const usersCol = db.collection<WithoutId<IUser>>('users');

const AGENT_INVITATION_EXPIARY_HOURS = 24 * 3600; // seconds

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

  // create a public channel named "All Team"
  await roomsCol.insertOne({
    name: 'All Team',
    orgId: newOrg.insertedId,
    usernames: [user.username],
    agents: [
      {
        _id: newAgent.insertedId,
        username: user.username,
      },
    ],
    contacts: [],
    creator: user.username,
    isPublic: true,
    type: RoomType.channel,
    deleted: false,
    createdAt: getNow(),
    userStatus: {
      [user.username]: {
        online: true,
        notis: 0,
        unRead: false,
        firstUnReadmessage: undefined,
        firstNotiMessage: undefined,
      },
    },
    isDefault: true,
  });
  return { newOrg, newAgent };
};

export const create = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    let { name, logoUrl = '', logoFileType, mlsFeeds = [], industryId } = req.body;

    const industry = await industriesCol.findOne({ _id: new ObjectId(industryId) });
    if (!industry) {
      return res.status(404).json({ msg: 'Not found industry' });
    }

    if (logoUrl && logoFileType) {
      const imageExtension = getImageExtension(logoFileType);
      if (!imageExtension) {
        return res.status(400).json({ msg: 'Invalid image type' });
      }

      const { url } = await uploadBase64ToS3('orgs', String(name).split(' ')[0], logoUrl, logoFileType, imageExtension);
      logoUrl = url;
    }

    const orgData: WithoutId<IOrg> = {
      name,
      owner: user.username,
      industryId: industry._id,
      logoUrl,
      mlsFeeds,
      createdAt: getNow(),
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
      return res.status(404).json({ msg: 'Organization does not exist' });
    }

    let { name, logoUrl, logoFileType, mlsFeeds = [] } = req.body;

    if (logoUrl && logoFileType) {
      const imageExtension = getImageExtension(logoFileType);
      if (!imageExtension) {
        return res.status(400).json({ msg: 'Invalid image type' });
      }

      const { url } = await uploadBase64ToS3('orgs', String(name).split(' ')[0], logoUrl, logoFileType, imageExtension);
      logoUrl = url;
    }

    await orgsCol.updateOne(
      { _id: org._id },
      {
        $set: {
          name,
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
      return res.status(404).json({ msg: 'Organization does not exist' });
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
      return res.status(404).json({ msg: 'Organization does not exist' });
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
      createdAt: { $gte: getNow() - AGENT_INVITATION_EXPIARY_HOURS }, // check expiry time
    });

    const code = getRandomString(10);

    await sendEmail(
      email,
      `Invitation to ${agentProfile.org?.name}`,
      undefined,
      `
        <p>You are invited to ${agentProfile.org?.name} by ${user.username}. Here's the
        <a href="${process.env.WEB_URL}/invitations/${agentProfile.orgId}?code=${code}" target="_blank">link</a>
        It will be expired in 24 hours.
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

export const resendInviteAgent = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const agentProfile = req.agentProfile as IAgentProfile;

    const { inviteId } = req.params;

    const invite = await invitesCol.findOne({
      _id: new ObjectId(inviteId),
      orgId: agentProfile.orgId,
      used: false,
      createdAt: { $gte: getNow() - AGENT_INVITATION_EXPIARY_HOURS }, // check expiry time
    });

    if (!invite) {
      return res.status(404).json({ msg: 'Not found invitation' });
    }

    await invitesCol.updateOne({ _id: invite._id }, { $set: { createdAt: getNow() } });

    await sendEmail(
      invite.email,
      'Confirm email',
      undefined,
      `
        <p>You are invited to ${agentProfile.org?.name} by ${user.username}. Here's the
        <a href="${process.env.WEB_URL}/invitations/${agentProfile.orgId}?code=${invite.code}" target="_blank">link</a>
        It will be expired in 24 hours.
        </p>
      `
    );

    return res.json({ msg: 'sent invitation' });
  } catch (error) {
    console.log('resendInviteAgent ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getInviteAgentLink = async (req: Request, res: Response) => {
  try {
    const agentProfile = req.agentProfile as IAgentProfile;

    const { inviteId } = req.params;

    const invite = await invitesCol.findOne({
      _id: new ObjectId(inviteId),
      orgId: agentProfile.orgId,
      used: false,
      createdAt: { $gte: getNow() - AGENT_INVITATION_EXPIARY_HOURS }, // check expiry time
    });

    if (!invite) {
      return res.status(404).json({ msg: 'Not found invitation' });
    }

    return res.json({ link: `${process.env.WEB_URL}/invitations/${agentProfile.orgId}?code=${invite.code}` });
  } catch (error) {
    console.log('resendInviteAgent ===>', error);
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

    if (invite.createdAt + AGENT_INVITATION_EXPIARY_HOURS < getNow()) {
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

    // assign agent into public rooms
    const rooms = await roomsCol.find({ orgId: org._id, isPublic: true, type: RoomType.channel }).toArray();
    for (const room of rooms) {
      const usernames = [...room.usernames, user.username];
      const users = await usersCol.find({ username: { $in: usernames } }).toArray();

      const roomData: IRoom = {
        ...room,
        usernames,
        agents: [...room.agents, { _id: newAgent.insertedId, username: user.username }],
        userStatus: {
          ...room.userStatus,
          [user.username]: {
            online: true,
            notis: 0,
            unRead: false,
            firstNotiMessage: undefined,
            firstUnReadmessage: undefined,
          },
        },
      };

      await roomsCol.updateOne({ _id: room._id }, { $set: roomData });

      users.forEach((u) => {
        u.socketIds?.forEach((socketId) => {
          if (io) {
            if (u.username === user.username) {
              io.to(socketId).emit(ServerMessageType.channelJoin, roomData);
            } else {
              io.to(socketId).emit(ServerMessageType.channelUpdate, roomData);
            }
          }
        });
      });
    }

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
            pipeline: [
              {
                $lookup: {
                  from: 'industries',
                  localField: 'industryId',
                  foreignField: '_id',
                  as: 'industry',
                },
              },
              {
                $unwind: {
                  path: '$industry',
                },
              },
            ],
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
            pipeline: [
              {
                $lookup: {
                  from: 'industries',
                  localField: 'industryId',
                  foreignField: '_id',
                  as: 'industry',
                },
              },
              {
                $unwind: {
                  path: '$industry',
                },
              },
            ],
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
        createdAt: { $gte: getNow() - AGENT_INVITATION_EXPIARY_HOURS }, // check expiry time
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
    const { username: targetUsername } = req.body;

    const targetUserProfile = await agentProfilesCol.findOne({
      orgId: agentProfile.orgId,
      username: targetUsername,
      deleted: false,
    });
    if (!targetUserProfile) {
      return res.status(404).json({ msg: 'No user to remove' });
    }

    if (roleOrder[agentProfile.role] >= roleOrder[targetUserProfile.role]) {
      return res.status(400).json({ msg: `You don't have permission to remove this user` });
    }

    await agentProfilesCol.updateOne({ _id: targetUserProfile._id }, { $set: { deleted: true, deletedAt: getNow() } });
    await contactsCol.deleteMany({ orgId: targetUserProfile.orgId, agentProfileId: targetUserProfile._id });

    // remove user in all rooms
    const rooms = await roomsCol
      .find({ orgId: agentProfile.orgId, type: RoomType.channel, usernames: targetUsername })
      .toArray();
    for (const room of rooms) {
      const usernames = room.usernames.filter((un) => un !== targetUsername);
      const users = await usersCol.find({ username: { $in: usernames } }).toArray();

      const roomData: IRoom = {
        ...room,
        usernames,
        agents: room.agents.filter((ag) => ag.username !== targetUsername),
      };

      await roomsCol.updateOne({ _id: room._id }, { $set: roomData });

      users.forEach((u) => {
        u.socketIds?.forEach((socketId) => {
          if (io) {
            io.to(socketId).emit(ServerMessageType.channelUpdate, roomData);
          }
        });
      });
    }

    const targetUser = await usersCol.findOne({ username: targetUsername });
    if (targetUser) {
      await sendEmail(
        targetUser.emails[0].email,
        `You are removed from ${agentProfile.org?.name}`,
        undefined,
        `
        <p>${agentProfile.username} removed you from ${agentProfile.org?.name} organization</p>
        `
      );

      targetUser.socketIds?.forEach((socketId) => {
        if (io) {
          io.to(socketId).emit(ServerMessageType.electronNotification, {
            title: 'You are removed',
            body: `${agentProfile.username} removed you from ${agentProfile.org?.name} organization`,
          });
        }
      });
    }

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

export const setWhiteLabel = async (req: Request, res: Response) => {
  try {
    const { id: orgId } = req.params;

    const org = await orgsCol.findOne({ _id: new ObjectId(orgId), deleted: false });
    if (!org) {
      return res.status(400).json({ msg: 'Organization does not exist' });
    }

    const { title, primary, secondary, background, fontFamily, description } = req.body;

    const whiteLabel: DefaultOrgTheme = {
      title,
      primary,
      secondary,
      background,
      fontFamily,
      description,
    };

    await orgsCol.updateOne(
      { _id: org._id },
      {
        $set: {
          whiteLabel,
        },
      }
    );

    return res.json({ msg: 'white label is updated!' });
  } catch (error) {
    console.log('org update error ===>', error);
    return res.status(500).json({ msg: 'Organization update error' });
  }
};

export const uploadBrandLogo = async (req: Request, res: Response) => {
  try {
    const { id: orgId } = req.params;

    const org = await orgsCol.findOne({ _id: new ObjectId(orgId), deleted: false });
    if (!org) {
      return res.status(404).json({ msg: 'Organization does not exist' });
    }

    const { logoUrl = '', logoFileType } = req.body;

    if (logoUrl && logoFileType) {
      const imageExtension = getImageExtension(logoFileType);
      if (!imageExtension) {
        return res.status(400).json({ msg: 'Invalid image type' });
      }

      const { url } = await uploadBase64ToS3(
        'orgs/brand',
        org.name.split(' ')[0],
        logoUrl,
        logoFileType,
        imageExtension
      );

      return res.json({ url });
    }

    return res.status(400).json({ msg: 'bad request' });
  } catch (error) {
    console.log('uploadBrandLogo error===>', error);
    return res.status(500).json({ msg: 'upload failed' });
  }
};

export const setBrand = async (req: Request, res: Response) => {
  try {
    const agentProfile = req.agentProfile as IAgentProfile;

    const { name, logos = [], colors = [], titleFont = '', bodyFont = '' } = req.body;

    const brand: IOrgBrand = {
      logos,
      colors,
      titleFont,
      bodyFont,
    };

    await orgsCol.updateOne(
      { _id: agentProfile.orgId },
      {
        $set: {
          name,
          brand,
        },
      }
    );

    return res.json({ msg: 'Brand is updated!' });
  } catch (error) {
    console.log('org update error ===>', error);
    return res.status(500).json({ msg: 'server error' });
  }
};
