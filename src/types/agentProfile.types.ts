import { ObjectId } from 'mongodb';
import { IOrg } from './org.types';
import { IUser } from './user.types';

export enum AgentRole {
  owner = 'owner',
  admin = 'admin',
  agent = 'agent',
}

export const roleOrder = {
  [AgentRole.owner]: 0,
  [AgentRole.admin]: 1,
  [AgentRole.agent]: 2,
  contact: 3,
};

export interface IAgentProfile {
  _id: ObjectId;
  orgId: ObjectId; // orgId + username is unique key
  org?: IOrg;
  username: string;
  userDisplayName?: string;
  userImage?: string;
  user?: IUser;
  email: string;
  phone?: string;
  image?: string;
  displayName?: string;
  description?: string;
  role: AgentRole;
  invitor?: string; // invitor username
  deleted: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}
