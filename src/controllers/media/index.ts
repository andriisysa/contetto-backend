import type { Request, Response } from 'express';
import { ObjectId, WithoutId } from 'mongodb';
import path from 'path';

import { db } from '@/database';
import { FilePermission, IFile, IFileConnect, IFileShare, IFolder, IFolderConnect } from '@/types/folder.types';
import { IUser } from '@/types/user.types';
import { deleteS3Objects, getDownloadSignedUrl, getS3Object, getUploadSignedUrl } from '@/utils/s3';
import { getNow, getRandomString } from '@/utils';
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
const fileSharesCol = db.collection<WithoutId<IFileShare>>('fileshares');

// folder operation
export const createFolder = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const agentProfile = req.agentProfile;
    const contact = req.contact;
    const folder = req.folder;

    const { name, isShared = false, forAgentOnly = false } = req.body;

    let parentPaths: ObjectId[] = [];
    if (folder) {
      if (agentProfile) {
        if (contact) {
          if (forAgentOnly) {
            parentPaths =
              folder.connections.find((con) => con.type === 'forAgentOnly' && con.id?.equals(contact._id))
                ?.parentPaths || [];
          } else {
            parentPaths =
              folder.connections.find((con) => con.type === 'contact' && con.id?.equals(contact._id))?.parentPaths ||
              [];
          }
        } else {
          if (isShared) {
            parentPaths = folder.connections.find((con) => con.type === 'shared')?.parentPaths || [];
          } else {
            parentPaths =
              folder.connections.find((con) => con.type === 'agent' && con.id?.equals(agentProfile._id))?.parentPaths ||
              [];
          }
        }
      } else {
        parentPaths =
          folder.connections.find((con) => con.type === 'contact' && con.id?.equals(contact!._id))?.parentPaths || [];
      }
    }

    let connections: IFolderConnect[] = [];
    if (agentProfile) {
      if (contact) {
        connections = [
          {
            id: contact._id,
            username: contact.name,
            type: forAgentOnly ? 'forAgentOnly' : 'contact',
            permission: FilePermission.editor,
            parentId: folder ? folder._id : '',
            parentPaths: folder ? [...parentPaths, folder._id] : [],
          },
        ];
      } else {
        if (isShared) {
          connections = [
            {
              id: undefined,
              username: undefined,
              type: 'shared',
              permission: FilePermission.editor,
              parentId: folder ? folder._id : '',
              parentPaths: folder ? [...parentPaths, folder._id] : [],
            },
          ];
        } else {
          connections = [
            {
              id: agentProfile._id,
              username: agentProfile.username,
              type: 'agent',
              permission: FilePermission.editor,
              parentId: folder ? folder._id : '',
              parentPaths: folder ? [...parentPaths, folder._id] : [],
            },
          ];
        }
      }
    } else {
      connections = [
        {
          id: contact!._id,
          username: contact!.name,
          type: 'contact',
          permission: FilePermission.editor,
          parentId: folder ? folder._id : '',
          parentPaths: folder ? [...parentPaths, folder._id] : [],
        },
      ];
    }

    const data: WithoutId<IFolder> = {
      name,
      orgId: (agentProfile?.orgId || contact?.orgId)!,
      creator: user.username,
      timestamp: getNow(),
      connections,
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
    const agentProfile = req.agentProfile;
    const contact = req.contact;
    const folder = req.folder;

    const { isShared = 'false', forAgentOnly = 'false' } = req.query;

    let query: any = {
      orgId: (agentProfile?.orgId || contact?.orgId)!,
    };

    let parentPaths: ObjectId[] = [];

    if (agentProfile) {
      if (contact) {
        query.connections = {
          $elemMatch: {
            id: contact._id,
            type: forAgentOnly === 'true' ? 'forAgentOnly' : 'contact',
            parentId: folder ? folder._id : '',
          },
        };
        if (folder) {
          parentPaths =
            folder.connections.find(
              (con) =>
                con.id?.equals(contact._id) && con.type === (forAgentOnly === 'true' ? 'forAgentOnly' : 'contact')
            )?.parentPaths || [];
        }
      } else {
        if (isShared === 'true') {
          query.connections = {
            $elemMatch: {
              id: undefined,
              type: 'shared',
              parentId: folder ? folder._id : '',
            },
          };
          if (folder) {
            parentPaths = folder.connections.find((con) => con.type === 'shared')?.parentPaths || [];
          }
        } else {
          query.connections = {
            $elemMatch: {
              id: agentProfile._id,
              type: 'agent',
              parentId: folder ? folder._id : '',
            },
          };
          if (folder) {
            parentPaths =
              folder.connections.find((con) => con.type === 'agent' && con.id?.equals(agentProfile._id))?.parentPaths ||
              [];
          }
        }
      }
    } else {
      query.connections = {
        $elemMatch: {
          id: contact?._id,
          type: 'contact',
          parentId: folder ? folder._id : '',
        },
      };

      if (folder) {
        parentPaths =
          folder.connections.find((con) => con.type === 'contact' && con.id?.equals(contact!._id))?.parentPaths || [];
      }
    }

    const subFolders = await foldersCol.find(query).toArray();
    const files = await filesCol.find(query).toArray();

    let parentFolders: IFolder[] = [];
    if (folder) {
      parentFolders = await foldersCol.find({ _id: { $in: parentPaths } }).toArray();
    }

    return res.json({ folder: folder ? { ...folder, parentFolders } : undefined, subFolders, files });
  } catch (error) {
    console.log('getFolder error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const searchFiles = async (req: Request, res: Response) => {
  try {
    const agentProfile = req.agentProfile;
    const contact = req.contact;

    const { search, isShared = 'false', forAgentOnly = 'false' } = req.query;

    let query: any = {
      name: {
        $regex: String(search)
          .trim()
          .replace(/[-[\]{}()*+?.,\\/^$|#\s]/g, '\\$&'),
        $options: 'i',
      },
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

    const folders = await foldersCol.find(query).toArray();
    const files = await filesCol.find(query).toArray();

    return res.json({ folders, files });
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

    let parentPaths: ObjectId[] = [];
    const query: any = {
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
        if (forAgentOnly) {
          parentPaths =
            targetFolder.connections.find((con) => con.type === 'forAgentOnly' && con.id?.equals(contact._id))
              ?.parentPaths || [];
        } else {
          parentPaths =
            targetFolder.connections.find((con) => con.type === 'contact' && con.id?.equals(contact._id))
              ?.parentPaths || [];
        }
      } else {
        if (isShared) {
          query.connections = {
            $elemMatch: {
              id: undefined,
              type: 'shared',
            },
          };
          parentPaths = targetFolder.connections.find((con) => con.type === 'shared')?.parentPaths || [];
        } else {
          query.connections = {
            $elemMatch: {
              id: agentProfile._id,
              type: 'agent',
            },
          };
          parentPaths =
            targetFolder.connections.find((con) => con.type === 'agent' && con.id?.equals(agentProfile._id))
              ?.parentPaths || [];
        }
      }
    } else {
      query.connections = {
        $elemMatch: {
          id: contact?._id,
          type: 'contact',
        },
      };
      parentPaths =
        targetFolder.connections.find((con) => con.type === 'contact' && con.id?.equals(contact!._id))?.parentPaths ||
        [];
    }

    const folders = await foldersCol
      .find({
        ...query,
        _id: { $in: folderIds.map((id: string) => new ObjectId(id)) },
      })
      .toArray();
    const files = await filesCol
      .find({ ...query, _id: { $in: fileIds.map((id: string) => new ObjectId(id)) } })
      .toArray();

    if (folderIds.length !== folders.length || fileIds.length !== files.length) {
      return res.status(400).json({ msg: 'Bad request' });
    }

    // move folders
    for (const folder of folders) {
      // update current folder
      const connections = folder.connections.map((con) => {
        if (agentProfile) {
          if (contact) {
            if (forAgentOnly) {
              if (con.id?.equals(contact._id) && con.type === 'forAgentOnly') {
                return {
                  ...con,
                  parentId: targetFolder._id,
                  parentPaths: [...parentPaths, targetFolder._id],
                };
              } else {
                return con;
              }
            } else {
              if (con.id?.equals(contact._id) && con.type === 'contact') {
                return {
                  ...con,
                  parentId: targetFolder._id,
                  parentPaths: [...parentPaths, targetFolder._id],
                };
              } else {
                return con;
              }
            }
          } else {
            if (isShared) {
              if (con.type === 'shared') {
                return {
                  ...con,
                  parentId: targetFolder._id,
                  parentPaths: [...parentPaths, targetFolder._id],
                };
              } else {
                return con;
              }
            } else {
              if (con.id?.equals(agentProfile._id) && con.type === 'agent') {
                return {
                  ...con,
                  parentId: targetFolder._id,
                  parentPaths: [...parentPaths, targetFolder._id],
                };
              } else {
                return con;
              }
            }
          }
        } else {
          if (con.id?.equals(contact!._id) && con.type === 'contact') {
            return {
              ...con,
              parentId: targetFolder._id,
              parentPaths: [...parentPaths, targetFolder._id],
            };
          } else {
            return con;
          }
        }
      });
      await foldersCol.updateOne({ _id: folder._id }, { $set: { connections } });

      // update subFolders
      const subFolderQuery = {
        ...query,
        connections: {
          ...query.connections,
          $elemMatch: {
            ...query.connections.$elemMatch,
            parentPaths: folder._id,
          },
        },
      };

      const subFolders = await foldersCol.find(subFolderQuery).toArray();
      if (subFolders.length > 0) {
        const bulkOps = subFolders.map((sub) => {
          const connections = sub.connections.map((con) => {
            if (agentProfile) {
              if (contact) {
                if (forAgentOnly) {
                  if (con.id?.equals(contact._id) && con.type === 'forAgentOnly') {
                    return {
                      ...con,
                      parentPaths: [
                        ...parentPaths,
                        targetFolder._id,
                        ...con.parentPaths.slice(con.parentPaths.findIndex((id) => id.equals(folder._id))),
                      ],
                    };
                  } else {
                    return con;
                  }
                } else {
                  if (con.id?.equals(contact._id) && con.type === 'contact') {
                    return {
                      ...con,
                      parentPaths: [
                        ...parentPaths,
                        targetFolder._id,
                        ...con.parentPaths.slice(con.parentPaths.findIndex((id) => id.equals(folder._id))),
                      ],
                    };
                  } else {
                    return con;
                  }
                }
              } else {
                if (isShared) {
                  if (con.type === 'shared') {
                    return {
                      ...con,
                      parentPaths: [
                        ...parentPaths,
                        targetFolder._id,
                        ...con.parentPaths.slice(con.parentPaths.findIndex((id) => id.equals(folder._id))),
                      ],
                    };
                  } else {
                    return con;
                  }
                } else {
                  if (con.id?.equals(agentProfile._id) && con.type === 'agent') {
                    return {
                      ...con,
                      parentPaths: [
                        ...parentPaths,
                        targetFolder._id,
                        ...con.parentPaths.slice(con.parentPaths.findIndex((id) => id.equals(folder._id))),
                      ],
                    };
                  } else {
                    return con;
                  }
                }
              }
            } else {
              if (con.id?.equals(contact!._id) && con.type === 'contact') {
                return {
                  ...con,
                  parentPaths: [
                    ...parentPaths,
                    targetFolder._id,
                    ...con.parentPaths.slice(con.parentPaths.findIndex((id) => id.equals(folder._id))),
                  ],
                };
              } else {
                return con;
              }
            }
          });

          return {
            updateOne: {
              filter: { _id: sub._id },
              update: {
                $set: {
                  connections,
                },
              },
            },
          };
        });

        // Execute the bulk write operation
        await foldersCol.bulkWrite(bulkOps);
      }
    }

    // move files
    await filesCol.updateMany(
      { ...query, _id: { $in: fileIds.map((id: string) => new ObjectId(id)) } },
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

    const query: any = {
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
          permission: FilePermission.editor,
        },
      };
    }

    const folders = await foldersCol
      .find({
        ...query,
        _id: { $in: folderIds.map((id: string) => new ObjectId(id)) },
      })
      .toArray();
    const files = await filesCol
      .find({ ...query, _id: { $in: fileIds.map((id: string) => new ObjectId(id)) } })
      .toArray();

    if (folderIds.length !== folders.length || fileIds.length !== files.length) {
      return res.status(400).json({ msg: 'You do not have permission' });
    }

    // delete folders
    for (const folder of folders) {
      // update subFolders
      const subFolderQuery = {
        orgId: (agentProfile?.orgId || contact?.orgId)!,
        connections: {
          $elemMatch: {
            parentPaths: folder._id,
          },
        },
      };
      const subFolders = await foldersCol.find(subFolderQuery).toArray();

      const allSubfiles = await filesCol
        .find({
          connections: {
            $elemMatch: {
              parentId: { $in: [...subFolders.map((f) => f._id), folder._id] },
            },
          },
        })
        .toArray();

      const availableFileQuery: any = {};
      if (agentProfile) {
        if (contact) {
          availableFileQuery.connections = {
            $elemMatch: {
              id: contact._id,
              type: forAgentOnly ? 'forAgentOnly' : 'contact',
              parentId: { $in: [...subFolders.map((f) => f._id), folder._id] },
            },
          };
        } else {
          if (isShared) {
            availableFileQuery.connections = {
              $elemMatch: {
                id: undefined,
                type: 'shared',
                parentId: { $in: [...subFolders.map((f) => f._id), folder._id] },
              },
            };
          } else {
            availableFileQuery.connections = {
              $elemMatch: {
                id: agentProfile._id,
                type: 'agent',
                parentId: { $in: [...subFolders.map((f) => f._id), folder._id] },
              },
            };
          }
        }
      } else {
        availableFileQuery.connections = {
          $elemMatch: {
            id: contact!._id,
            type: 'contact',
            parentId: { $in: [...subFolders.map((f) => f._id), folder._id] },
            permission: FilePermission.editor,
          },
        };
      }
      const editableSubfiles = await filesCol.find(availableFileQuery).toArray();
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

export const shareFolder = async (req: Request, res: Response) => {
  try {
    const agentProfile = req.agentProfile;
    const contact = req.contact;

    if (!agentProfile) {
      return res.status(400).json({ msg: 'Permission denied' });
    }

    const { folderId } = req.params;
    const {
      orgShare = false,
      contactIds = [],
      permission,
      notify = false,
      forAgentOnly = false,
      isShared = false,
    } = req.body;

    const folder = await foldersCol.findOne({
      _id: new ObjectId(folderId),
      orgId: agentProfile.orgId,
    });
    if (!folder) {
      return res.status(404).json({ msg: 'Not found folder' });
    }

    // update subfolders
    const subFolderQuery: any = {
      orgId: (agentProfile?.orgId || contact?.orgId)!,
    };
    if (contact) {
      subFolderQuery.connections = {
        $elemMatch: {
          id: contact._id,
          type: forAgentOnly ? 'forAgentOnly' : 'contact',
          parentPaths: folder._id,
        },
      };
    } else {
      if (isShared) {
        subFolderQuery.connections = {
          $elemMatch: {
            id: undefined,
            type: 'shared',
            parentPaths: folder._id,
          },
        };
      } else {
        subFolderQuery.connections = {
          $elemMatch: {
            id: agentProfile._id,
            type: 'agent',
            parentPaths: folder._id,
          },
        };
      }
    }
    const subFolders = await foldersCol.find(subFolderQuery).toArray();
    const subFiles = await filesCol
      .find({
        connections: {
          $elemMatch: {
            parentId: { $in: [...subFolders.map((f) => f._id), folder._id] },
          },
        },
      })
      .toArray();

    if (orgShare) {
      const connections = [
        ...folder.connections,
        ...(folder.connections.find((con) => con.type === 'shared' && !con.id)
          ? []
          : [
              {
                id: undefined,
                username: undefined,
                type: 'shared',
                permission: FilePermission.editor,
                parentId: '',
                parentPaths: [],
              },
            ]),
      ] as IFolderConnect[];

      // share folder
      await foldersCol.updateOne({ _id: folder._id }, { $set: { connections } });

      if (subFolders.length > 0) {
        const bulkFolderOps = subFolders.map((sub) => {
          const currentConnection = sub.connections[0];
          const existing = sub.connections.find((con) => !con.id && con.type === 'shared');
          const connections = [
            ...sub.connections,
            ...(existing
              ? []
              : [
                  {
                    ...currentConnection!,
                    id: undefined,
                    username: undefined,
                    type: 'shared',
                    permission: FilePermission.editor,
                    parentPaths: currentConnection!.parentPaths.slice(
                      currentConnection?.parentPaths.findIndex((path) => path.equals(folder._id))
                    ),
                  },
                ]),
          ] as IFolderConnect[];

          return {
            updateOne: {
              filter: { _id: sub._id },
              update: {
                $set: {
                  connections,
                },
              },
            },
          };
        });

        // Execute the bulk write operation
        await foldersCol.bulkWrite(bulkFolderOps);
      }

      if (subFiles.length > 0) {
        // update subfiles
        const fileBulkOps = subFiles.map((sub) => {
          const currentConnection = sub.connections[0];
          const existing = sub.connections.find((con) => !con.id && con.type === 'shared');
          const connections = [
            ...sub.connections,
            ...(existing
              ? []
              : [
                  {
                    ...currentConnection!,
                    id: undefined,
                    username: undefined,
                    type: 'shared',
                    permission: FilePermission.editor,
                  },
                ]),
          ] as IFileConnect[];

          return {
            updateOne: {
              filter: { _id: sub._id },
              update: {
                $set: {
                  connections,
                },
              },
            },
          };
        });

        // Execute the bulk write operation
        await filesCol.bulkWrite(fileBulkOps);
      }

      return res.json({ msg: 'shared' });
    }

    const contacts = await contactsCol
      .find({ _id: { $in: contactIds.map((cid: string) => new ObjectId(cid)) }, agentProfileId: agentProfile._id })
      .toArray();

    if (contactIds.length !== contacts.length) {
      return res.status(400).json({ msg: 'bad request' });
    }

    const connections = [
      ...folder.connections.map((con) =>
        contacts.find((contact) => contact._id.toString() === con.id?.toString())
          ? { ...con, permission, type: 'contact' }
          : con
      ),
      ...contacts
        .filter((contact) => !folder.connections.find((con) => contact._id.toString() === con.id?.toString()))
        .map((contact) => ({
          id: contact._id,
          username: contact.name,
          type: 'contact',
          permission: permission as FilePermission,
          parentId: '',
          parentPaths: [],
        })),
    ] as IFolderConnect[];

    // share files
    await foldersCol.updateOne({ _id: folder._id }, { $set: { connections } });

    if (subFolders.length > 0) {
      // update subfolders
      const bulkFolderOps = subFolders.map((sub) => {
        const connections = [
          ...sub.connections.map((con) =>
            contacts.find((contact) => contact._id.toString() === con.id?.toString())
              ? { ...con, permission, type: 'contact' }
              : con
          ),
          ...contacts
            .filter((contact) => !sub.connections.find((con) => contact._id.toString() === con.id?.toString()))
            .map((contact) => ({
              id: contact._id,
              username: contact.name,
              type: 'contact',
              permission: permission as FilePermission,
              parentId: sub.connections[0].parentId,
              parentPaths: sub.connections[0].parentPaths.slice(
                sub.connections[0].parentPaths.findIndex((path) => path.equals(folder._id))
              ),
            })),
        ] as IFolderConnect[];

        return {
          updateOne: {
            filter: { _id: sub._id },
            update: {
              $set: {
                connections,
              },
            },
          },
        };
      });

      // Execute the bulk write operation
      await foldersCol.bulkWrite(bulkFolderOps);
    }

    if (subFiles.length > 0) {
      // update subfiles
      const fileBulkOps = subFiles.map((sub) => {
        const connections = [
          ...sub.connections.map((con) =>
            contacts.find((contact) => contact._id.toString() === con.id?.toString())
              ? { ...con, permission, type: 'contact' }
              : con
          ),
          ...contacts
            .filter((contact) => !sub.connections.find((con) => contact._id.toString() === con.id?.toString()))
            .map((contact) => ({
              id: contact._id,
              username: contact.name,
              type: 'contact',
              permission: permission as FilePermission,
              parentId: sub.connections[0].parentId,
            })),
        ] as IFileConnect[];

        return {
          updateOne: {
            filter: { _id: sub._id },
            update: {
              $set: {
                connections,
              },
            },
          },
        };
      });

      // Execute the bulk write operation
      await filesCol.bulkWrite(fileBulkOps);
    }

    if (notify) {
      for (const contact of contacts) {
        await sendMessage(
          agentProfile,
          contact,
          String(folder._id),
          `${agentProfile.username} shared a folder "${folder.name}"`
        );
      }
    }

    return res.json({ msg: 'shared' });
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

    const { name, type } = req.body;

    const data = await getUploadSignedUrl(String(agentProfile?.orgId || contact?.orgId), name, type);

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

    const { name, type, isShared = false, forAgentOnly = false, s3Key, size = 0 } = req.body;
    const parsed = path.parse(name);

    const data: WithoutId<IFile> = {
      name,
      orgId: (agentProfile?.orgId || contact?.orgId)!,
      creator: user.username,
      s3Key,
      size,
      ext: parsed.ext,
      mimetype: type,
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

const sendMessage = async (agentProfile: IAgentProfile, contact: IContact, folderId: string, msg: string) => {
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
    // create message
    const msgData: WithoutId<IMessage> = {
      orgId: agentProfile.orgId,
      roomId: dm._id,
      msg,
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
};

export const shareFile = async (req: Request, res: Response) => {
  try {
    const agentProfile = req.agentProfile as IAgentProfile;

    const { fileId } = req.params;
    const { orgShare = false, contactIds = [], permission, notify = false } = req.body;

    const query: any = {
      _id: new ObjectId(fileId),
      orgId: agentProfile.orgId,
    };

    const file = await filesCol.findOne(query);
    if (!file) {
      return res.status(404).json({ msg: 'Not found file' });
    }

    if (orgShare) {
      const connections = [
        ...file.connections,
        ...(file.connections.find((con) => con.type === 'shared' && !con.id)
          ? []
          : [
              {
                id: undefined,
                username: undefined,
                type: 'shared',
                permission: FilePermission.editor,
                parentId: '',
              },
            ]),
      ] as IFileConnect[];

      // share files
      await filesCol.updateOne({ _id: file._id }, { $set: { connections } });

      return res.json({ msg: 'shared' });
    }

    const contacts = await contactsCol
      .find({ _id: { $in: contactIds.map((cid: string) => new ObjectId(cid)) }, agentProfileId: agentProfile._id })
      .toArray();

    if (contactIds.length !== contacts.length) {
      return res.status(400).json({ msg: 'bad request' });
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
        await sendMessage(agentProfile, contact, '', `${agentProfile.username} shared a file "${file.name}"`);
      }
    }

    return res.json({ msg: 'shared' });
  } catch (error) {
    console.log('deleteFolder error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const shareForAgentOnlyFile = async (req: Request, res: Response) => {
  try {
    const agentProfile = req.agentProfile as IAgentProfile;

    const { fileId, contactId } = req.params;

    const contact = await contactsCol.findOne({ _id: new ObjectId(contactId), agentProfileId: agentProfile._id });

    if (!contact) {
      return res.status(400).json({ msg: 'bad request' });
    }

    const query: any = {
      _id: new ObjectId(fileId),
      orgId: agentProfile.orgId,
      creator: agentProfile.username,
      connections: {
        $elemMatch: {
          id: contact._id,
          type: 'forAgentOnly',
        },
      },
    };

    const file = await filesCol.findOne(query);
    if (!file) {
      return res.status(400).json({ msg: 'Bad request' });
    }

    const connections = file.connections.map((con) =>
      contact._id.toString() === con.id?.toString()
        ? { ...con, permission: FilePermission.editor, type: 'contact', parentId: '' }
        : con
    ) as IFileConnect[];

    // share files
    await filesCol.updateOne({ _id: file._id }, { $set: { connections } });

    await sendMessage(agentProfile, contact, '', `${agentProfile.username} shared a file "${file.name}"`);

    return res.json({ msg: 'shared' });
  } catch (error) {
    console.log('deleteFolder error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getFileShareLink = async (req: Request, res: Response) => {
  try {
    const agentProfile = req.agentProfile as IAgentProfile;

    const { fileId } = req.params;

    const file = await filesCol.findOne({
      _id: new ObjectId(fileId),
      orgId: agentProfile.orgId,
    });

    if (!file) {
      return res.status(400).json({ msg: 'Not found file' });
    }

    const fileShare = await fileSharesCol.findOne({
      orgId: agentProfile.orgId,
      agentId: agentProfile._id,
      fileId: file._id,
    });
    if (fileShare) {
      const link = `${process.env.WEB_URL}/files/share/${fileShare._id}?orgId=${agentProfile.orgId}&code=${fileShare.code}`;
      return res.json({ link });
    }

    // create a new share
    const code = getRandomString(10);
    const newFileShare = await fileSharesCol.insertOne({
      orgId: agentProfile.orgId,
      agentId: agentProfile._id,
      agentName: agentProfile.username,
      fileId: new ObjectId(fileId),
      code,
    });

    const link = `${process.env.WEB_URL}/files/share/${newFileShare.insertedId}?orgId=${agentProfile.orgId}&code=${code}`;

    return res.json({ link });
  } catch (error) {
    console.log('deleteFolder error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
