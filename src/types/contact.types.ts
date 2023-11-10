import { ObjectId } from 'mongodb';
import { IOrg } from './org.types';
import { IAgentProfile } from './agentProfile.types';
import { IUser } from './user.types';

export interface IContact {
  _id: ObjectId;
  username: string;
  email: string;
  phone?: string;
  image?: string;
  user?: IUser;
  name?: string;
  orgId: ObjectId;
  org?: IOrg;
  agentProfileId: ObjectId;
  invitor: string; // agent usernmae
  agent?: IAgentProfile;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
  deletedAt?: number;
}
