import type { Request, Response } from 'express';
import { ObjectId, WithoutId } from 'mongodb';

import { db } from '@/database';
import { FilePermission, IFile, IFileConnect, IFileShare } from '@/types/folder.types';
import { getDownloadSignedUrl } from '@/utils/s3';
import { IUser } from '@/types/user.types';
import { IAgentProfile } from '@/types/agentProfile.types';
import { IContact } from '@/types/contact.types';

const filesCol = db.collection<WithoutId<IFile>>('files');
const fileSharesCol = db.collection<WithoutId<IFileShare>>('fileshares');
const agentProfilesCol = db.collection<WithoutId<IAgentProfile>>('agentProfiles');
const contactsCol = db.collection<WithoutId<IContact>>('contacts');

export const getFile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { orgId, code } = req.query;

    if (!orgId || !code) {
      return res.status(400).json({ msg: 'bad request' });
    }
    const fileshare = await fileSharesCol.findOne({
      _id: new ObjectId(id),
      orgId: new ObjectId(String(orgId)),
      code,
    });

    if (!fileshare) {
      return res.status(400).json({ msg: 'bad request' });
    }

    const file = await filesCol.findOne({ _id: fileshare.fileId });
    if (!file) {
      return res.status(404).json({ msg: 'Not found file' });
    }

    const downloadUrl = await getDownloadSignedUrl(file.s3Key);

    return res.json({ ...file, downloadUrl });
  } catch (error) {
    console.log('admin getOrgs ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const copySharedFile = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const { orgId, code } = req.body;

    if (!orgId || !code) {
      return res.status(400).json({ msg: 'bad request' });
    }
    const fileshare = await fileSharesCol.findOne({
      _id: new ObjectId(id),
      orgId: new ObjectId(String(orgId)),
      code,
    });

    if (!fileshare) {
      return res.status(400).json({ msg: 'bad request' });
    }

    const file = await filesCol.findOne({ _id: fileshare.fileId });
    if (!file) {
      return res.status(404).json({ msg: 'Not found file' });
    }

    let contact = await contactsCol.findOne({
      orgId: fileshare.orgId,
      agentProfileId: fileshare.agentId,
      username: user.username,
    });

    if (!contact) {
      contact = await contactsCol.findOne({
        orgId: fileshare.orgId,
        username: user.username,
      });
    }

    if (contact) {
      // copy file
      const connections = [
        ...file.connections,
        ...(file.connections.find((con) => con.type === 'contact' && contact?._id.toString() === con.id?.toString())
          ? []
          : [
              {
                id: contact._id,
                username: contact.name,
                type: 'contact',
                permission: FilePermission.editor,
                parentId: '',
              },
            ]),
      ] as IFileConnect[];

      // share files
      await filesCol.updateOne({ _id: file._id }, { $set: { connections } });
    } else {
      const agent = await agentProfilesCol.findOne({
        orgId: fileshare.orgId,
        username: user.username,
      });

      if (agent) {
        // copyfile
        const connections = [
          ...file.connections,
          ...(file.connections.find((con) => con.type === 'agent' && agent._id.toString() === con.id?.toString())
            ? []
            : [
                {
                  id: agent._id,
                  username: agent.username,
                  type: 'agent',
                  permission: FilePermission.editor,
                  parentId: '',
                },
              ]),
        ] as IFileConnect[];

        // share files
        await filesCol.updateOne({ _id: file._id }, { $set: { connections } });
      } else {
        return res.status(400).json({ msg: 'Permission denied! you are not a user in this organization' });
      }
    }

    return res.json({ msg: 'copied' });
  } catch (error) {
    console.log('admin getOrgs ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
