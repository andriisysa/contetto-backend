import { ObjectId } from 'mongodb';
import { IAgentProfile } from './agentProfile.types';
import { IContact } from './contact.types';

export interface IRoomUserStatus {
  [username: string]: {
    online: boolean;
    notis: number; // the number of mentions and messages in DM
    unRead: boolean; // unread messages exists or not
    firstUnReadmessage?: ObjectId;
    firstNotiMessage?: ObjectId;
    // socketId?: string;
  };
}

export enum RoomType {
  channel = 'channel',
  dm = 'dm',
}

export interface IRoomAgent {
  _id: ObjectId; // agentProfile id
  username: string;
}

export interface IRoomContact {
  _id: ObjectId; // contactId
  name: string;
  username?: string;
  agentId: ObjectId;
  agentName: string;
}

export interface IRoom {
  _id: ObjectId;
  orgId: ObjectId;
  name?: string; // optional for dm
  usernames: string[]; // unique usernames in room
  agents: IRoomAgent[];
  agentProfiles?: IAgentProfile[];
  contacts: IRoomContact[];
  contactProfiles?: IContact[];
  creator: string; // creator username
  type: RoomType;
  userStatus: IRoomUserStatus;
  dmInitiated?: boolean;
  createdAt: number; // unix timestamp
  updatedAt?: number; // unix timestamp
  deleted: boolean;
}
