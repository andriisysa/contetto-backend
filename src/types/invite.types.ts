import { ObjectId } from 'mongodb';

export enum InviteType {
  org = 'org',
  agent = 'agent',
}

export interface IInvite {
  _id: ObjectId;
  code: string;
  bindType: InviteType;
  bindId: ObjectId;
  used: boolean;
  usedBy: string; // username
  createdAt: number;
  usedAt: number;
}
