import type { Request, Response } from 'express';
import { ObjectId, WithoutId } from 'mongodb';
import mime from 'mime';
import path from 'path';

import { db } from '@/database';
import { IFile, IFolder } from '@/types/folder.types';
import { IUser } from '@/types/user.types';
import { getDownloadSignedUrl, getS3Object, getUploadSignedUrl } from '@/utils/s3';
import { getNow } from '@/utils';

const foldersCol = db.collection<WithoutId<IFolder>>('folders');
const filesCol = db.collection<WithoutId<IFile>>('files');

// folder operation
export const createFolder = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const agentProfile = req.agentProfile;
    const contact = req.contact;
    const folder = req.folder;

    const { name, isShared = false, forAgentOnly = false } = req.body;

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

export const getFolder = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const agentProfile = req.agentProfile;
    const contact = req.contact;
    const folder = req.folder;

    const { isShared = 'false', forAgentOnly = 'false' } = req.query;

    let match: Partial<IFolder> = {};

    if (agentProfile) {
      match = {
        orgId: agentProfile.orgId,
        parentId: folder ? folder._id : '',
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
    } else {
      match = {
        orgId: contact!.orgId,
        contactId: contact!._id,
        forAgentOnly: false,
        parentId: folder ? folder._id : '',
      };
    }

    const subFolders = await foldersCol.find(match).toArray();
    const files = await filesCol.find(match).toArray();

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

export const moveFiles = async (req: Request, res: Response) => {
  try {
    const agentProfile = req.agentProfile;
    const contact = req.contact;
    const targetFolder = req.folder as IFolder;

    const { folderIds = [], fileIds = [] } = req.body;

    if (folderIds.length === 0 && fileIds.length === 0) {
      return res.status(400).json({ msg: 'Bad request' });
    }

    const folders = await foldersCol
      .find({
        _id: { $in: folderIds.map((id: string) => new ObjectId(id)) },
        orgId: (agentProfile?.orgId || contact?.orgId)!,
        contactId: contact?._id,
      })
      .toArray();
    const files = await filesCol
      .find({
        _id: { $in: fileIds.map((id: string) => new ObjectId(id)) },
        orgId: (agentProfile?.orgId || contact?.orgId)!,
        contactId: contact?._id,
      })
      .toArray();

    if (folderIds.length !== folders.length || fileIds.length !== files.length) {
      return res.status(400).json({ msg: 'Bad request' });
    }

    // move folders
    for (const folder of folders) {
      // update current folder
      await foldersCol.updateOne(
        { _id: folder._id },
        { $set: { parentId: targetFolder._id, parentPaths: [...targetFolder.parentPaths, targetFolder._id] } }
      );

      // update subFolders
      const subFolders = await foldersCol.find({ parentPaths: folder._id }).toArray();
      const bulkOps = subFolders.map((sub) => ({
        updateOne: {
          filter: { _id: sub._id },
          update: {
            $set: {
              parentPaths: [
                ...targetFolder.parentPaths,
                targetFolder._id,
                ...sub.parentPaths.slice(sub.parentPaths.findIndex((id) => id.equals(folder._id))),
              ],
            },
          },
        },
      }));

      // Execute the bulk write operation
      await foldersCol.bulkWrite(bulkOps);

      // update subFiles
      const subFiles = await filesCol.find({ parentPaths: folder._id }).toArray();
      const fileBulkOps = subFiles.map((f) => ({
        updateOne: {
          filter: { _id: f._id },
          update: {
            $set: {
              parentPaths: [
                ...targetFolder.parentPaths,
                targetFolder._id,
                ...f.parentPaths.slice(f.parentPaths.findIndex((id) => id.equals(folder._id))),
              ],
            },
          },
        },
      }));
      await filesCol.bulkWrite(fileBulkOps);
    }

    // move files
    await filesCol.updateMany(
      { _id: { $in: files.map((file) => file._id) } },
      { $set: { parentId: targetFolder._id, parentPaths: [...targetFolder.parentPaths, targetFolder._id] } }
    );

    return res.json({ msg: 'success' });
  } catch (error) {
    console.log('moveFolder error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const deleteFiles = async (req: Request, res: Response) => {
  try {
    const agentProfile = req.agentProfile;
    const contact = req.contact;

    const { folderIds = [], fileIds = [] } = req.body;

    if (folderIds.length === 0 && fileIds.length === 0) {
      return res.status(400).json({ msg: 'Bad request' });
    }

    const folders = await foldersCol
      .find({
        _id: { $in: folderIds.map((id: string) => new ObjectId(id)) },
        orgId: (agentProfile?.orgId || contact?.orgId)!,
        contactId: contact?._id,
      })
      .toArray();
    const files = await filesCol
      .find({
        _id: { $in: fileIds.map((id: string) => new ObjectId(id)) },
        orgId: (agentProfile?.orgId || contact?.orgId)!,
        contactId: contact?._id,
      })
      .toArray();

    if (folderIds.length !== folders.length || fileIds.length !== files.length) {
      return res.status(400).json({ msg: 'Bad request' });
    }

    // delete folders
    for (const folder of folders) {
      await foldersCol.deleteOne({ _id: folder._id });
      await foldersCol.deleteMany({ parentPaths: folder._id });
      await filesCol.deleteMany({ parentPaths: folder._id });
    }

    // delete files
    await filesCol.deleteMany({
      _id: { $in: files.map((file) => file._id) },
    });

    return res.json({ msg: 'deleted' });
  } catch (error) {
    console.log('deleteFolder error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

// file operation
export const getUploadFileUrl = async (req: Request, res: Response) => {
  try {
    const agentProfile = req.agentProfile;
    const contact = req.contact;

    const { name } = req.body;

    const data = await getUploadSignedUrl(String(agentProfile?.orgId || contact?.orgId), name);

    return res.json(data);
  } catch (error) {
    console.log('getPresignedUrl error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const storeFile = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const agentProfile = req.agentProfile;
    const contact = req.contact;
    const folder = req.folder;

    const { name, isShared = false, forAgentOnly = false, s3Key, size = 0 } = req.body;
    const parsed = path.parse(name);

    const data: WithoutId<IFile> = {
      name,
      orgId: (agentProfile?.orgId || contact?.orgId)!,
      isShared,
      contactId: contact?._id,
      parentId: folder ? folder._id : '',
      parentPaths: folder ? [...folder.parentPaths, folder._id] : [],
      forAgentOnly,
      creator: user.username,
      agentName: agentProfile?.username,
      s3Key,
      size,
      ext: parsed.ext,
      mimetype: mime.getType(name) as string,
      timestamp: getNow(),
    };

    const newFile = await filesCol.insertOne(data);

    return res.json({ ...data, _id: newFile.insertedId });
  } catch (error) {
    console.log('storeFile error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const downloadFileUrl = async (req: Request, res: Response) => {
  try {
    const agentProfile = req.agentProfile;
    const contact = req.contact;
    const folder = req.folder;

    const { fileId } = req.params;

    const file = await filesCol.findOne({
      _id: new ObjectId(fileId),
      orgId: (agentProfile?.orgId || contact?.orgId)!,
      contactId: contact?._id,
      parentId: folder ? folder._id : '',
    });

    if (!file) {
      return res.status(404).json({ msg: 'Not found file' });
    }

    const url = await getDownloadSignedUrl(file.s3Key);

    return res.json({ url });
  } catch (error) {
    console.log('downloadFile error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const loadfile = async (req: Request, res: Response) => {
  try {
    const agentProfile = req.agentProfile;
    const contact = req.contact;
    const folder = req.folder;

    const { fileId } = req.params;

    const file = await filesCol.findOne({
      _id: new ObjectId(fileId),
      orgId: (agentProfile?.orgId || contact?.orgId)!,
      contactId: contact?._id,
      parentId: folder ? folder._id : '',
    });

    if (!file) {
      return res.status(404).json({ msg: 'Not found file' });
    }
    if (file.size > 10000) {
      return res.status(401).json({ msg: 'too large file' });
    }

    const data = await getS3Object(file.s3Key);

    res.setHeader('Content-Type', file.mimetype);

    return res.send(data);
  } catch (error) {
    console.log('loadImage error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const renameFile = async (req: Request, res: Response) => {
  try {
    const agentProfile = req.agentProfile;
    const contact = req.contact;
    const folder = req.folder;

    const { fileId } = req.params;
    const { name } = req.body;

    const file = await filesCol.findOne({
      _id: new ObjectId(fileId),
      orgId: (agentProfile?.orgId || contact?.orgId)!,
      contactId: contact?._id,
      parentId: folder ? folder._id : '',
    });

    if (!file) {
      return res.status(404).json({ msg: 'Not found file' });
    }

    await filesCol.updateOne({ _id: file._id }, { $set: { name } });

    return res.json({ ...file, name });
  } catch (error) {
    console.log('renameFile error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
