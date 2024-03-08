import { ObjectId } from 'mongodb';
import { IUser } from './user.types';
import { IRoom } from './room.types';

export interface IMessageUserStatus {
  [username: string]: {
    read: boolean;
    readAt?: number;
  };
}

export enum MsgAttLinkedFromType {
  brochure = 'brochure',
  fileSystem = 'file-system',
}

export interface IMsgAttachment {
  _id: ObjectId;
  roomId: ObjectId;
  name: string;
  url: string;
  s3Key: string;
  mimetype: string;
  size: number;
  timestamp: number;
  creator: string;
  linkedFrom?: MsgAttLinkedFromType;
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
  attachmentIds: ObjectId[];
  attachments?: IMsgAttachment[];
  edited: boolean;
  mentions: string[]; // usernames
  channels: string[]; // channel names
  editable: boolean;
  sharelink?: string;
  agentLink?: string;
  contactLink?: string;
}

export interface IMessagePayload {
  room: IRoom;
  user: IUser;
  msg?: string;
  messageId?: string;
  mentions?: string[]; // usernames
  channels?: string[]; // channel names
  attachmentIds?: string[];
  deletAttachmentId?: string;
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

  // notification for electron app
  electronNotification = 'electron:notification',

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
  attachmentDelete = 'attachment:delete',
}
