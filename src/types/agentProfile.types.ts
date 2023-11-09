import { ObjectId } from 'mongodb';
import { IOrg } from './org.types';

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
  email: string;
  phone?: string;
  description?: string;
  role: AgentRole;
  deleted: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}
