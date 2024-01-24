import { ObjectId } from 'mongodb';

export interface ITemplate {
  _id: ObjectId;
  name: string;
  orgIds: ObjectId[];
  isPublic: boolean;
  data: any;
}
