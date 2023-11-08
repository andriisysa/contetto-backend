import { ObjectId } from 'mongodb';

export enum RoleType {
  owner = 'owner',
  admin = 'admin',
  agent = 'agent',
  client = 'client',
}

export interface IUserRole {
  orgId: ObjectId;
  agentProfileId?: ObjectId;
  role: RoleType;
}

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
  phones?: IPhone[];
  roles?: IUserRole[];
  verificationCode: number;
  verified: boolean;
  createdAt: number;
  updatedAt: number;
}
