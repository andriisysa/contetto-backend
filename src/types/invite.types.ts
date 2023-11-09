import { ObjectId } from 'mongodb';
import { AgentRole } from './agentProfile.types';

export enum InviteType {
  org = 'org',
  contact = 'contact',
}

export interface IInvite {
  _id: ObjectId;
  code: string;
  bindType: InviteType;
  bindId: ObjectId;
  orgId: ObjectId;
  used: boolean;
  usedBy?: string; // username
  createdAt: number;
  usedAt?: number;
  role?: AgentRole;
}
