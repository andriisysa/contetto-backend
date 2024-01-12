import { ObjectId } from 'mongodb';
import { IUser } from './user.types';
import { IRoom } from './room.types';

export interface IMessageUserStatus {
  [username: string]: {
    read: boolean;
    readAt?: number;
  };
}

export interface IMsgAttachMent {
  url: string;
  type: 'image' | 'video' | 'pdf';
  createdAt: number;
}

export interface IMessage {
  _id: ObjectId;
  orgId: ObjectId;
  roomId: ObjectId;
  msg?: string;
  senderName: string; // sender username
  sender?: IUser;
  createdAt: number; // milliseconds timestamp
  updatedAt?: number; // milliseconds timestamp
  // userStatus: IMessageUserStatus;
  attatchMents: IMsgAttachMent[];
  edited: boolean;
  mentions: string[]; // usernames
  channels: string[]; // channel names
}

export interface IMessagePayload {
  room: IRoom;
  user: IUser;
  msg?: string;
  messageId?: string;
  mentions: string[]; // usernames
  channels: string[]; // channel names
  typing?: boolean;
}

export enum ServerMessageType {
  // welcome
  connected = 'connected',

  // token
  updateToken = 'updateToken',

  // channel
  channelUpdate = 'channel:update',
  channelJoin = 'channel:join',
  dmCreate = 'dm:create',
  channelArchive = 'channel:archive',

  // message
  msgSend = 'msg:send',
  msgUpdate = 'msg:update',
  msgRead = 'msg:read',
  msgTyping = 'msg:typing',
  msgDelete = 'msg:delete',

  // error
  invalidRequest = 'error:invalid',
  authError = 'error:auth',
  unknownError = 'error:unknown',
  notFoundError = 'error:notfound',
}

export enum ClientMessageType {
  msgSend = 'msg:send',
  msgUpdate = 'msg:update',
  msgRead = 'msg:read',
  msgTyping = 'msg:typing',
  msgDelete = 'msg:delete',
}
