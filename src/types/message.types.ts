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
  createdAt: number; // unix timestamp
  updatedAt?: number; // unix timestamp
  // userStatus: IMessageUserStatus;
  attatchMents: IMsgAttachMent[];
  edited: boolean;
  // mentions:
}

export interface IMessagePayload {
  room: IRoom;
  user: IUser;
  msg?: string;
  messageId?: string;
}

export enum ServerMessageType {
  // token
  updateToken = 'updateToken',

  // channel
  channelUpdate = 'channel:update',
  channelJoin = "channel:join",

  // message
  msgSend = 'msg:send',
  msgUpdate = 'msg:update',
  msgTyping = 'msg:typing',

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
  msgTyping = 'msg:typing'
}
