import type { Request, Response } from 'express';
import { ObjectId, WithoutId } from 'mongodb';

import { db } from '@/database';
import { IFile, IFolder } from '@/types/folder.types';
import { IUser } from '@/types/user.types';

const foldersCol = db.collection<WithoutId<IFolder>>('folders');
const filescol = db.collection<WithoutId<IFile>>('files');

// folder operation
export const createFolder = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const agentProfile = req.agentProfile;
    const contact = req.contact;
    const folder = req.folder;

    const { name, isShared = false, parentId = '', forAgentOnly = false } = req.body;

    const data: WithoutId<IFolder> = {
      name,
      orgId: (agentProfile?.orgId || contact?.orgId)!,
      isShared,
      contactId: contact?._id,
      parentId: folder ? folder._id : '',
      parentPaths: folder ? [...folder.parentPaths, folder._id] : [],
      forAgentOnly,
      creator: user.username,
      agentName: agentProfile?.username,
    };

    const newFolder = await foldersCol.insertOne(data);

    return res.json({ ...data, _id: newFolder.insertedId });
  } catch (error) {
    console.log('createFolder error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

const lookup = {
  from: 'folders',
  localField: 'parentPaths',
  foreignField: '_id',
  pipeline: [
    {
      $project: {
        name: 1,
      },
    },
  ],
  as: 'parentFolders',
};

export const getRootFolder = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const agentProfile = req.agentProfile;
    const contact = req.contact;

    const { isShared = 'false', forAgentOnly = 'false' } = req.query;

    let subFolders: IFolder[] = [];
    let files: IFile[] = [];

    if (agentProfile) {
      const match: Partial<IFolder> = {
        orgId: agentProfile.orgId,
        parentId: '',
      };

      if (contact) {
        match.contactId = contact._id;
        match.forAgentOnly = forAgentOnly === 'true';
      } else {
        if (isShared === 'true') {
          match.isShared = true;
        } else {
          match.isShared = false;
          match.creator = user.username;
        }
      }

      subFolders = (await foldersCol
        .aggregate([
          {
            $match: match,
          },
          {
            $lookup: lookup,
          },
        ])
        .toArray()) as IFolder[];

      files = (await filescol
        .aggregate([
          {
            $match: match,
          },
          {
            $lookup: lookup,
          },
        ])
        .toArray()) as IFile[];
    } else {
      const match = {
        orgId: contact!.orgId,
        contactId: contact!._id,
        forAgentOnly: false,
        parentId: '',
      };

      subFolders = (await foldersCol
        .aggregate([
          {
            $match: match,
          },
          {
            $lookup: lookup,
          },
        ])
        .toArray()) as IFolder[];

      files = (await filescol
        .aggregate([
          {
            $match: match,
          },
          {
            $lookup: lookup,
          },
        ])
        .toArray()) as IFile[];
    }

    return res.json({ subFolders, files });
  } catch (error) {
    console.log('getRootFolder error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getFolder = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const agentProfile = req.agentProfile;
    const contact = req.contact;
    const folder = req.folder as IFolder;

    const { isShared = 'false', forAgentOnly = 'false' } = req.query;

    let subFolders: IFolder[] = [];
    let files: IFile[] = [];

    if (agentProfile) {
      const match: Partial<IFolder> = {
        orgId: agentProfile.orgId,
        parentId: folder._id,
      };

      if (contact) {
        match.contactId = contact._id;
        match.forAgentOnly = forAgentOnly === 'true';
      } else {
        if (isShared === 'true') {
          match.isShared = true;
        } else {
          match.isShared = false;
          match.creator = user.username;
        }
      }

      subFolders = (await foldersCol
        .aggregate([
          {
            $match: match,
          },
          {
            $lookup: lookup,
          },
        ])
        .toArray()) as IFolder[];

      files = (await filescol
        .aggregate([
          {
            $match: match,
          },
          {
            $lookup: lookup,
          },
        ])
        .toArray()) as IFile[];
    } else {
      const match = {
        orgId: contact!.orgId,
        contactId: contact!._id,
        forAgentOnly: false,
        parentId: folder._id,
      };

      subFolders = (await foldersCol
        .aggregate([
          {
            $match: match,
          },
          {
            $lookup: lookup,
          },
        ])
        .toArray()) as IFolder[];

      files = (await filescol
        .aggregate([
          {
            $match: match,
          },
          {
            $lookup: lookup,
          },
        ])
        .toArray()) as IFile[];
    }

    return res.json({ folder, subFolders, files });
  } catch (error) {
    console.log('getFolder error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const renameFolder = async (req: Request, res: Response) => {
  try {
    const folder = req.folder as IFolder;

    const { name } = req.body;

    await foldersCol.updateOne({ _id: folder._id }, { $set: { name } });

    return res.json({ ...folder, name });
  } catch (error) {
    console.log('renameFolder error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const moveFolder = async (req: Request, res: Response) => {
  try {
    return res.json({});
  } catch (error) {
    console.log('moveFolder error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const deleteFolder = async (req: Request, res: Response) => {
  try {
    const folder = req.folder as IFolder;

    await foldersCol.deleteOne({ _id: folder._id });

    return res.json({ msg: 'deleted' });
  } catch (error) {
    console.log('deleteFolder error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

// file operation
export const getPresignedUrl = async (req: Request, res: Response) => {
  try {
    return res.json({});
  } catch (error) {
    console.log('getPresignedUrl error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const storeFile = async (req: Request, res: Response) => {
  try {
    return res.json({});
  } catch (error) {
    console.log('storeFile error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getFile = async (req: Request, res: Response) => {
  try {
    return res.json({});
  } catch (error) {
    console.log('getFile error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const renameFile = async (req: Request, res: Response) => {
  try {
    return res.json({});
  } catch (error) {
    console.log('renameFile error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const moveFile = async (req: Request, res: Response) => {
  try {
    return res.json({});
  } catch (error) {
    console.log('moveFile error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const deleteFile = async (req: Request, res: Response) => {
  try {
    return res.json({});
  } catch (error) {
    console.log('deleteFile error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
