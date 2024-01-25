import type { Request, Response } from 'express';
import { ObjectId, WithoutId } from 'mongodb';
import mime from 'mime';
import path from 'path';

import { db } from '@/database';
import { FilePermission, IFile, IFileConnect, IFolder } from '@/types/folder.types';
import { IUser } from '@/types/user.types';
import { deleteS3Objects, getDownloadSignedUrl, getS3Object, getUploadSignedUrl } from '@/utils/s3';
import { getNow } from '@/utils';
import { IContact } from '@/types/contact.types';
import { IAgentProfile } from '@/types/agentProfile.types';

const foldersCol = db.collection<WithoutId<IFolder>>('folders');
const filesCol = db.collection<WithoutId<IFile>>('files');
const contactsCol = db.collection<WithoutId<IContact>>('contacts');

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
      timestamp: getNow(),
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

    let folderQuery: Partial<IFolder> = {
      orgId: agentProfile?.orgId || contact?.orgId,
      parentId: folder ? folder._id : '',
    };
    let fileQuery: any = {
      orgId: (agentProfile?.orgId || contact?.orgId)!,
    };

    if (agentProfile) {
      if (contact) {
        folderQuery.contactId = contact._id;
        folderQuery.forAgentOnly = forAgentOnly === 'true';

        fileQuery['connections.id'] = contact._id;
        fileQuery['connections.type'] = forAgentOnly === 'true' ? 'forAgentOnly' : 'contact';
        fileQuery['connections.parentId'] = folder ? folder._id : '';
      } else {
        if (isShared === 'true') {
          folderQuery.isShared = true;
          folderQuery.contactId = undefined;

          fileQuery['connections.id'] = undefined;
          fileQuery['connections.type'] = 'shared';
          fileQuery['connections.parentId'] = folder ? folder._id : '';
        } else {
          folderQuery.isShared = false;
          folderQuery.creator = user.username;
          folderQuery.contactId = undefined;

          fileQuery['connections.id'] = agentProfile._id;
          fileQuery['connections.type'] = 'agent';
          fileQuery['connections.parentId'] = folder ? folder._id : '';
        }
      }
    } else {
      folderQuery.contactId = contact!._id;
      folderQuery.forAgentOnly = false;

      fileQuery['connections.id'] = contact?._id;
      fileQuery['connections.type'] = 'contact';
      fileQuery['connections.parentId'] = folder ? folder._id : '';
    }

    const subFolders = await foldersCol.find(folderQuery).toArray();
    const files = await filesCol.find(fileQuery).toArray();

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

    const { folderIds = [], fileIds = [], isShared = false, forAgentOnly = false } = req.body;

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

    const fileQuery: any = {
      _id: { $in: fileIds.map((id: string) => new ObjectId(id)) },
      orgId: (agentProfile?.orgId || contact?.orgId)!,
    };
    if (agentProfile) {
      if (contact) {
        fileQuery['connections.id'] = contact._id;
        fileQuery['connections.type'] = forAgentOnly ? 'forAgentOnly' : 'contact';
      } else {
        if (isShared) {
          fileQuery['connections.id'] = undefined;
          fileQuery['connections.type'] = 'shared';
        } else {
          fileQuery['connections.id'] = agentProfile._id;
          fileQuery['connections.type'] = 'agent';
        }
      }
    } else {
      fileQuery['connections.id'] = contact?._id;
      fileQuery['connections.type'] = 'contact';
    }

    const files = await filesCol.find(fileQuery).toArray();

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
    }

    // move files
    await filesCol.updateMany(
      { ...fileQuery },
      {
        $set: {
          'connections.&.parentId': targetFolder._id,
        },
      }
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

    const { folderIds = [], fileIds = [], isShared = false, forAgentOnly = false } = req.body;

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
    const fileQuery: any = {
      _id: { $in: fileIds.map((id: string) => new ObjectId(id)) },
      orgId: (agentProfile?.orgId || contact?.orgId)!,
    };
    if (agentProfile) {
      if (contact) {
        fileQuery['connections.id'] = contact._id;
        fileQuery['connections.type'] = forAgentOnly ? 'forAgentOnly' : 'contact';
      } else {
        if (isShared) {
          fileQuery['connections.type'] = 'shared';
        } else {
          fileQuery['connections.id'] = agentProfile._id;
          fileQuery['connections.type'] = 'agent';
        }
      }
    } else {
      fileQuery['connections.id'] = contact?._id;
      fileQuery['connections.type'] = 'contact';
      fileQuery['connections.permission'] = FilePermission.editor;
    }

    const files = await filesCol.find(fileQuery).toArray();

    if (folderIds.length !== folders.length || fileIds.length !== files.length) {
      return res.status(400).json({ msg: 'Bad request' });
    }

    // delete folders
    for (const folder of folders) {
      const subFolders = await foldersCol.find({ parentPaths: folder._id }).toArray();
      const allSubfiles = await filesCol
        .find({ 'connections.parentId': { $in: subFolders.map((f) => f._id) } })
        .toArray();

      const query: any = {};
      if (!agentProfile) {
        query['connections.id'] = contact!._id;
        query['connections.parentId'] = { $in: subFolders.map((f) => f._id) };
        query['connections.permission'] = FilePermission.editor;
      }
      const editableSubfiles = await filesCol.find(query).toArray();
      if (editableSubfiles.length !== allSubfiles.length) {
        return res.status(404).json({ msg: "there are some files that you don't have permission to delete" });
      }

      // delete all subfiles
      await filesCol.deleteMany({ _id: { $in: allSubfiles.map((file) => file._id) } });
      await deleteS3Objects(allSubfiles.map((file) => file.s3Key));

      // delete all subfolders
      await foldersCol.deleteMany({ _id: { $in: subFolders.map((sf) => sf._id) } });

      // delete current folder
      await foldersCol.deleteOne({ _id: folder._id });
    }

    // delete files
    await filesCol.deleteMany({
      _id: { $in: files.map((file) => file._id) },
    });
    await deleteS3Objects(files.map((file) => file.s3Key));

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
      creator: user.username,
      s3Key,
      size,
      ext: parsed.ext,
      mimetype: mime.getType(name) as string,
      timestamp: getNow(),
      connections: [],
    };

    if (agentProfile) {
      if (contact) {
        data.connections = [
          {
            id: contact._id,
            username: contact.name,
            type: forAgentOnly ? 'forAgentOnly' : 'contact',
            permission: FilePermission.editor,
            parentId: folder ? folder._id : '',
          },
        ];
      } else {
        if (isShared) {
          data.connections = [
            {
              id: undefined,
              username: undefined,
              type: 'shared',
              permission: FilePermission.editor,
              parentId: folder ? folder._id : '',
            },
          ];
        } else {
          data.connections = [
            {
              id: agentProfile._id,
              username: agentProfile.username,
              type: 'agent',
              permission: FilePermission.editor,
              parentId: folder ? folder._id : '',
            },
          ];
        }
      }
    } else {
      data.connections = [
        {
          id: contact?._id,
          username: contact?.name,
          type: 'contact',
          permission: FilePermission.editor,
          parentId: folder ? folder._id : '',
        },
      ];
    }

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

    const { fileId } = req.params;
    const { isShared = false, forAgentOnly = false } = req.body;

    const query: any = {
      _id: new ObjectId(fileId),
      orgId: (agentProfile?.orgId || contact?.orgId)!,
    };

    if (agentProfile) {
      if (contact) {
        query['connections.id'] = contact._id;
        query['connections.type'] = forAgentOnly ? 'forAgentOnly' : 'contact';
      } else {
        if (isShared) {
          query['connections.id'] = undefined;
          query['connections.type'] = 'shared';
        } else {
          query['connections.id'] = agentProfile._id;
          query['connections.type'] = 'agent';
        }
      }
    } else {
      query['connections.id'] = contact?._id;
      query['connections.type'] = 'contact';
    }

    const file = await filesCol.findOne(query);

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

    const { fileId } = req.params;

    const { isShared = 'false', forAgentOnly = 'false' } = req.query;

    const query: any = {
      _id: new ObjectId(fileId),
      orgId: (agentProfile?.orgId || contact?.orgId)!,
    };
    if (agentProfile) {
      if (contact) {
        query['connections.id'] = contact._id;
        query['connections.type'] = forAgentOnly === 'true' ? 'forAgentOnly' : 'contact';
      } else {
        if (isShared === 'true') {
          query['connections.id'] = undefined;
          query['connections.type'] = 'shared';
        } else {
          query['connections.id'] = agentProfile._id;
          query['connections.type'] = 'agent';
        }
      }
    } else {
      query['connections.id'] = contact?._id;
      query['connections.type'] = 'contact';
    }

    const file = await filesCol.findOne(query);

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

    const { fileId } = req.params;
    const { name, isShared = false, forAgentOnly = false } = req.body;

    const query: any = {
      _id: new ObjectId(fileId),
      orgId: (agentProfile?.orgId || contact?.orgId)!,
    };
    if (agentProfile) {
      if (contact) {
        query['connections.id'] = contact._id;
        query['connections.type'] = forAgentOnly ? 'forAgentOnly' : 'contact';
      } else {
        if (isShared) {
          query['connections.id'] = undefined;
          query['connections.type'] = 'shared';
        } else {
          query['connections.id'] = agentProfile._id;
          query['connections.type'] = 'agent';
        }
      }
    } else {
      query['connections.id'] = contact?._id;
      query['connections.type'] = 'contact';
    }

    const file = await filesCol.findOne(query);
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

export const shareFile = async (req: Request, res: Response) => {
  try {
    const agentProfile = req.agentProfile as IAgentProfile;

    const { fileId } = req.params;
    const { contactIds = [], permission } = req.body;

    const contacts = await contactsCol
      .find({ _id: { $in: contactIds.map((cid: string) => new ObjectId(cid)) }, agentProfileId: agentProfile._id })
      .toArray();

    if (contactIds.length !== contacts.length) {
      return res.status(400).json({ msg: 'bad request' });
    }

    const query: any = {
      _id: new ObjectId(fileId),
      orgId: agentProfile.orgId,
      'connections.id': agentProfile._id,
      'connections.type': 'agent',
    };

    const file = await filesCol.findOne(query);
    if (!file) {
      return res.status(400).json({ msg: 'Bad request' });
    }

    const connections = [
      ...file.connections.map((con) =>
        contacts.find((contact) => contact._id.toString() === con.id?.toString()) ? { ...con, permission } : con
      ),
      ...contacts
        .filter((contact) => file.connections.find((con) => contact._id.toString() !== con.id?.toString()))
        .map((contact) => ({
          id: contact._id,
          username: contact.name,
          type: 'contact',
          permission: permission as FilePermission,
          parentId: '',
        })),
    ] as IFileConnect[];

    // share files
    await filesCol.updateOne({ _id: file._id }, { $set: { connections } });

    return res.json({ msg: 'shared' });
  } catch (error) {
    console.log('deleteFolder error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
