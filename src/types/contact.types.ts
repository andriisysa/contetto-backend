import { ObjectId } from 'mongodb';
import { IOrg } from './org.types';
import { IAgentProfile } from './agentProfile.types';
import { IUser } from './user.types';

export interface IContactNote {
  _id: ObjectId;
  contactId: ObjectId;
  note: string;
  timestamp: number;
}

export interface IContact {
  _id: ObjectId;
  name: string; // contact name
  notes?: IContactNote[];
  username?: string; // shared username
  user?: IUser;
  userEmail?: string;
  userPhone?: string;
  userImage?: string;
  email?: string;
  phone?: string;
  image?: string;
  orgId: ObjectId;
  org?: IOrg;
  agentProfileId: ObjectId;
  agentName: string; // agent usernmae
  agent?: IAgentProfile;
  createdAt: number;
  updatedAt: number;
  inviteCode?: string;
}
