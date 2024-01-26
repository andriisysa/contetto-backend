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
import { IRoom, RoomType } from '@/types/room.types';
import { IMessage, ServerMessageType } from '@/types/message.types';
import { io } from '@/socketServer';

const foldersCol = db.collection<WithoutId<IFolder>>('folders');
const filesCol = db.collection<WithoutId<IFile>>('files');
const contactsCol = db.collection<WithoutId<IContact>>('contacts');
const usersCol = db.collection<WithoutId<IUser>>('users');
const roomsCol = db.collection<WithoutId<IRoom>>('rooms');
const messagesCol = db.collection<WithoutId<IMessage>>('messages');

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

        fileQuery.connections = {
          $elemMatch: {
            id: contact._id,
            type: forAgentOnly === 'true' ? 'forAgentOnly' : 'contact',
            parentId: folder ? folder._id : '',
          },
        };
      } else {
        if (isShared === 'true') {
          folderQuery.isShared = true;
          folderQuery.contactId = undefined;

          fileQuery.connections = {
            $elemMatch: {
              id: undefined,
              type: 'shared',
              parentId: folder ? folder._id : '',
            },
          };
        } else {
          folderQuery.isShared = false;
          folderQuery.creator = user.username;
          folderQuery.contactId = undefined;

          fileQuery.connections = {
            $elemMatch: {
              id: agentProfile._id,
              type: 'agent',
              parentId: folder ? folder._id : '',
            },
          };
        }
      }
    } else {
      folderQuery.contactId = contact!._id;
      folderQuery.forAgentOnly = false;

      fileQuery.connections = {
        $elemMatch: {
          id: contact?._id,
          type: 'contact',
          parentId: folder ? folder._id : '',
        },
      };
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
        fileQuery.connections = {
          $elemMatch: {
            id: contact?._id,
            type: forAgentOnly ? 'forAgentOnly' : 'contact',
          },
        };
      } else {
        if (isShared) {
          fileQuery.connections = {
            $elemMatch: {
              id: undefined,
              type: 'shared',
            },
          };
        } else {
          fileQuery.connections = {
            $elemMatch: {
              id: agentProfile._id,
              type: 'agent',
            },
          };
        }
      }
    } else {
      fileQuery.connections = {
        $elemMatch: {
          id: contact?._id,
          type: 'contact',
        },
      };
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
          'connections.$.parentId': targetFolder._id,
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
        fileQuery.connections = {
          $elemMatch: {
            id: contact._id,
            type: forAgentOnly ? 'forAgentOnly' : 'contact',
          },
        };
      } else {
        if (isShared) {
          fileQuery.connections = {
            $elemMatch: {
              id: undefined,
              type: 'shared',
            },
          };
        } else {
          fileQuery.connections = {
            $elemMatch: {
              id: agentProfile._id,
              type: 'agent',
            },
          };
        }
      }
    } else {
      fileQuery.connections = {
        $elemMatch: {
          id: contact?._id,
          type: 'contact',
          permission: FilePermission.editor,
        },
      };
    }

    const files = await filesCol.find(fileQuery).toArray();

    if (folderIds.length !== folders.length || fileIds.length !== files.length) {
      return res.status(400).json({ msg: 'You do not have permission' });
    }

    // delete folders
    for (const folder of folders) {
      const subFolders = await foldersCol.find({ parentPaths: folder._id }).toArray();
      const allSubfiles = await filesCol
        .find({
          connections: {
            $elemMatch: {
              parentId: { $in: [...subFolders.map((f) => f._id), folder._id] },
            },
          },
        })
        .toArray();

      const query: any = {};
      if (agentProfile) {
        if (contact) {
          query.connections = {
            $elemMatch: {
              id: contact._id,
              type: forAgentOnly ? 'forAgentOnly' : 'contact',
              parentId: { $in: [...subFolders.map((f) => f._id), folder._id] },
            },
          };
        } else {
          if (isShared) {
            query.connections = {
              $elemMatch: {
                id: undefined,
                type: 'shared',
                parentId: { $in: [...subFolders.map((f) => f._id), folder._id] },
              },
            };
          } else {
            query.connections = {
              $elemMatch: {
                id: agentProfile._id,
                type: 'agent',
                parentId: { $in: [...subFolders.map((f) => f._id), folder._id] },
              },
            };
          }
        }
      } else {
        query.connections = {
          $elemMatch: {
            id: contact!._id,
            type: 'contact',
            parentId: { $in: [...subFolders.map((f) => f._id), folder._id] },
            permission: FilePermission.editor,
          },
        };
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
        query.connections = {
          $elemMatch: {
            id: contact._id,
            type: forAgentOnly ? 'forAgentOnly' : 'contact',
          },
        };
      } else {
        if (isShared) {
          query.connections = {
            $elemMatch: {
              id: undefined,
              type: 'shared',
            },
          };
        } else {
          query.connections = {
            $elemMatch: {
              id: agentProfile._id,
              type: 'agent',
            },
          };
        }
      }
    } else {
      query.connections = {
        $elemMatch: {
          id: contact?._id,
          type: 'contact',
        },
      };
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
        query.connections = {
          $elemMatch: {
            id: contact._id,
            type: forAgentOnly === 'true' ? 'forAgentOnly' : 'contact',
          },
        };
      } else {
        if (isShared === 'true') {
          query.connections = {
            $elemMatch: {
              id: undefined,
              type: 'shared',
            },
          };
        } else {
          query.connections = {
            $elemMatch: {
              id: agentProfile._id,
              type: 'agent',
            },
          };
        }
      }
    } else {
      query.connections = {
        $elemMatch: {
          id: contact?._id,
          type: 'contact',
        },
      };
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
        query.connections = {
          $elemMatch: {
            id: contact._id,
            type: forAgentOnly ? 'forAgentOnly' : 'contact',
          },
        };
      } else {
        if (isShared) {
          query.connections = {
            $elemMatch: {
              id: undefined,
              type: 'shared',
            },
          };
        } else {
          query.connections = {
            $elemMatch: {
              id: agentProfile._id,
              type: 'agent',
            },
          };
        }
      }
    } else {
      query.connections = {
        $elemMatch: {
          id: contact?._id,
          type: 'contact',
        },
      };
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
    const { contactIds = [], permission, notify = false } = req.body;

    const contacts = await contactsCol
      .find({ _id: { $in: contactIds.map((cid: string) => new ObjectId(cid)) }, agentProfileId: agentProfile._id })
      .toArray();

    if (contactIds.length !== contacts.length) {
      return res.status(400).json({ msg: 'bad request' });
    }

    const query: any = {
      _id: new ObjectId(fileId),
      orgId: agentProfile.orgId,
      connections: {
        $elemMatch: {
          id: agentProfile._id,
          type: 'agent',
        },
      },
    };

    const file = await filesCol.findOne(query);
    if (!file) {
      return res.status(400).json({ msg: 'Bad request' });
    }

    const connections = [
      ...file.connections.map((con) =>
        contacts.find((contact) => contact._id.toString() === con.id?.toString())
          ? { ...con, permission, type: 'contact' }
          : con
      ),
      ...contacts
        .filter((contact) => !file.connections.find((con) => contact._id.toString() === con.id?.toString()))
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

    if (notify) {
      for (const contact of contacts) {
        // get dm & update dm
        const dm = await roomsCol.findOne({
          orgId: agentProfile.orgId,
          usernames: {
            $all: [agentProfile.username, contact.username || contact._id.toString()],
          },
          type: RoomType.dm,
          deleted: false,
        });
        if (dm) {
          const connection = file.connections.find((con) => con.id?.toString() === contact._id.toString());
          const folderId = connection?.parentId;
          // create message
          const msgData: WithoutId<IMessage> = {
            orgId: agentProfile.orgId,
            roomId: dm._id,
            msg: `New file "${file.name}" is shared`,
            senderName: agentProfile.username,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            attatchMents: [],
            edited: false,
            editable: false,
            agentLink: `contacts/${contact._id}/folders/forcontact${folderId ? `/${folderId}` : ''}`,
            contactLink: `folders${folderId ? `/${folderId}` : ''}`,
            mentions: [],
            channels: [],
          };
          const newMsg = await messagesCol.insertOne(msgData);

          // get all users
          const users = await usersCol.find({ username: { $in: dm.usernames } }).toArray();

          // update room
          const roomData: IRoom = {
            ...dm,
            userStatus: {
              ...dm.userStatus,
              ...dm.usernames.reduce(
                (obj, un) => ({
                  ...obj,
                  [un]: {
                    online: !!users.find((u) => u.username === un)?.socketId,
                    notis: un !== agentProfile.username ? dm.userStatus[un].notis + 1 : dm.userStatus[un].notis,
                    unRead: true,
                    firstNotiMessage:
                      un !== agentProfile.username
                        ? dm.userStatus[un].firstNotiMessage || newMsg.insertedId
                        : dm.userStatus[un].firstNotiMessage,
                    firstUnReadmessage: dm.userStatus[un].firstUnReadmessage || newMsg.insertedId,
                    socketId: users.find((u) => u.username === un)?.socketId,
                  },
                }),
                {}
              ),
            },
          };

          if (dm.type === RoomType.dm && !dm.dmInitiated) {
            roomData.dmInitiated = true;
          }

          await roomsCol.updateOne({ _id: dm._id }, { $set: roomData });

          users.forEach((u) => {
            if (io && u.socketId) {
              // update room
              io.to(u.socketId).emit(ServerMessageType.channelUpdate, roomData);

              // send message
              io.to(u.socketId).emit(ServerMessageType.msgSend, { ...msgData, _id: newMsg.insertedId });
            }
          });
        }
      }
    }

    return res.json({ msg: 'shared' });
  } catch (error) {
    console.log('deleteFolder error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
