import type { Request, Response, NextFunction } from 'express';
import { IUser } from '@/types/user.types';
import { AgentRole, IAgentProfile, roleOrder } from '@/types/agentProfile.types';
import { db } from '@/database';
import { ObjectId, WithoutId } from 'mongodb';

const agentProfilesCol = db.collection<WithoutId<IAgentProfile>>('agentProfiles');

const orgRoleAuth = (role: AgentRole) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id: orgId } = req.params;

    if (!orgId) {
      return res.status(401).json({ msg: 'No organization selected' });
    }

    const agentProfiles = await agentProfilesCol
      .aggregate<IAgentProfile>([
        {
          $match: {
            orgId: new ObjectId(orgId),
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

    if (agentProfiles.length === 0) {
      return res.status(404).json({ msg: 'You are not an agent in this organization' });
    }

    if (roleOrder[agentProfiles[0].role] > roleOrder[role]) {
      return res.status(404).json({ msg: "You don't have role to perform this" });
    }

    req.agentProfile = agentProfiles[0];

    await next();
  } catch (error) {
    return res.status(500).json({ msg: 'Server Error' });
  }
};

export default orgRoleAuth;
