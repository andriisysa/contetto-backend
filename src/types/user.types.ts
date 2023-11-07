import { ObjectId } from 'mongodb';

export interface IUser {
  _id: ObjectId;
  username: string;
  emails: string[];
  phones?: string[];
  
}
