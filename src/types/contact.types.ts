import { ObjectId } from 'mongodb';
import { IOrg } from './org.types';
import { IAgentProfile } from './agentProfile.types';
import { IUser } from './user.types';

export interface IContact {
  _id: ObjectId;
  name: string; // contact name
  note: string;
  username?: string; // shared username
  user?: IUser;
  image?: string;
  orgId: ObjectId;
  org?: IOrg;
  agentProfileId: ObjectId;
  agentName: string; // agent usernmae
  agent?: IAgentProfile;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
  deletedAt?: number;
  inviteCode?: string;
}
