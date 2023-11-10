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
  invitor: string; // invite username
  orgId: ObjectId;
  used: boolean;
  usedBy?: string; // invited username
  createdAt: number;
  usedAt?: number;
  role?: AgentRole;
}
