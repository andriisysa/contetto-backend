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
}

export enum FilePermission {
  owner = 'owner',
  editor = 'editor',
  viewer = 'viewer',
  commentor = 'commentor',
}

export interface IFile extends IFolder {
  s3Key: string;
  ext: string;
  mimetype: string;
  size: number; // byte
  timestamp: number;
  copied: boolean; // if false, it's orignal file, if true, it's a file copied from orignal file
  permission: FilePermission;
}
