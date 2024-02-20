import { ObjectId } from 'mongodb';

export enum FilePermission {
  editor = 'editor',
  viewer = 'viewer',
}

export interface IFileConnect {
  id?: ObjectId; // agentId or contactId or null for org shared
  username?: string; // agent username or contact name
  type: 'agent' | 'contact' | 'shared' | 'forAgentOnly';
  permission: FilePermission;
  parentId: ObjectId | ''; // parentId = '' means it's root folder
}

export interface IFolderConnect extends IFileConnect {
  parentPaths: ObjectId[];
}

export interface IFolder {
  _id: ObjectId;
  name: string;
  orgId: ObjectId;
  parentFolders?: IFolder[];
  creator: string; // username
  timestamp: number;
  connections: IFolderConnect[];
}

export interface IFile {
  _id: ObjectId;
  name: string;
  orgId: ObjectId;
  s3Key: string;
  publicUrl?: string;
  ext: string;
  mimetype: string;
  size: number; // byte
  timestamp: number;
  creator: string;
  connections: IFileConnect[];
}

export interface IFileShare {
  _id: ObjectId;
  orgId: ObjectId;
  agentId: ObjectId;
  agentName: string; // agent username
  fileId: ObjectId;
  code: string;
}
