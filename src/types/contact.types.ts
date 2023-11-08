import { ObjectId } from 'mongodb';

export interface IContact {
  _id: ObjectId;
  username: string;
  name: string;
  orgId: ObjectId;
  agentProfileId: ObjectId;
}
