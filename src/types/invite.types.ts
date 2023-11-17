import { ObjectId } from 'mongodb';
import { AgentRole } from './agentProfile.types';

export interface IInvite {
  _id: ObjectId;
  code: string;
  invitorId: ObjectId; // agent profileId
  invitor: string; // invite username
  orgId: ObjectId;
  used: boolean;
  usedBy?: string; // invited username
  createdAt: number;
  usedAt?: number;
  role?: AgentRole;
}
