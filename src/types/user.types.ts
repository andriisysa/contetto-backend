import { ObjectId } from 'mongodb';

export interface IEmail {
  email: string;
  verified: boolean;
  primary: boolean;
}

export interface IPhone {
  phone: string;
  verified: boolean;
  primary: boolean;
}

export interface IUser {
  _id: ObjectId;
  username: string;
  password: string;
  emails: IEmail[];
  name?: string;
  phones?: IPhone[];
  image?: string;
  verificationCode: string;
  verified: boolean;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
  socketId?: string;
}
