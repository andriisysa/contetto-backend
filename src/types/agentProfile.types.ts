import { ObjectId } from 'mongodb';

export interface IAgentProfile {
  _id: ObjectId;
  orgId: ObjectId;
  username: string;
  email: string;
  phone: string;
  description: string;
}
