import { IUser } from '@/types/user.types';
import type { Request, Response, NextFunction } from 'express';
import { ObjectId, WithoutId } from 'mongodb';

import { db } from '@/database';
import { IFolder } from '@/types/folder.types';

const foldersCol = db.collection<WithoutId<IFolder>>('folders');

export const folderAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const agentProfile = req.agentProfile;
    const contact = req.contact;

    const { folderId: pfId } = req.params;
    const { folderId: qfId } = req.query;
    const { folderId: bfId } = req.body;

    const folderId = pfId || qfId || bfId;
    if (folderId) {
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

      if (agentProfile) {
        const folders = await foldersCol
          .aggregate([
            {
              $match: {
                _id: new ObjectId(folderId),
                orgId: agentProfile.orgId,
                $or: [
                  { isShared: true },
                  { isShared: false, creator: user.username },
                  ...(contact ? [{ contactId: contact._id }] : []),
                ],
              },
            },
            {
              $lookup: lookup,
            },
          ])
          .toArray();

        if (folders.length === 0) {
          return res.status(404).json({ msg: 'not found folder' });
        }

        req.folder = folders[0] as IFolder;
      } else {
        const folders = await foldersCol
          .aggregate([
            {
              $match: {
                _id: new ObjectId(folderId),
                orgId: contact!.orgId,
                contactId: contact!._id,
                forAgentOnly: false,
              },
            },
            {
              $lookup: lookup,
            },
          ])
          .toArray();

        if (folders.length === 0) {
          return res.status(404).json({ msg: 'not found folder' });
        }

        req.folder = folders[0] as IFolder;
      }
    }

    await next();
  } catch (error) {
    console.log('agentOrContact error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
