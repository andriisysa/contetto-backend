import { ObjectId } from 'mongodb';

export interface IFolder {
  _id: ObjectId;
  name: string;
  orgId: ObjectId;
  isShared: boolean; // if true, it's shared across all org agents
  contactId?: ObjectId; // if exists, it's shared with contact (isShared must be false in this case)
  forAgentOnly: boolean; // for contact shared only, if true, it's only visible for agent only, not contacts
  parentId: ObjectId | ''; // parentId = '' means it's root folder
  parentPaths: ObjectId[];
  parentFolders?: IFolder[];
  creator: string; // username
  agentName?: string; // exists if it's created by agent
  timestamp: number;
}

export enum FilePermission {
  editor = 'editor',
  viewer = 'viewer',
  commentor = 'commentor',
}

export interface IFileConnect {
  id?: ObjectId; // agentId or contactId or null for org shared
  username?: string; // agent username or contact name
  type: 'agent' | 'contact' | 'shared' | 'forAgentOnly';
  permission: FilePermission;
  parentId: ObjectId | ''; // parentId = '' means it's root folder
}

export interface IFile {
  _id: ObjectId;
  name: string;
  orgId: ObjectId;
  s3Key: string;
  ext: string;
  mimetype: string;
  size: number; // byte
  timestamp: number;
  creator: string;
  connections: IFileConnect[];
}
