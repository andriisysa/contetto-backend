import type { Request, Response } from 'express';
import { ObjectId, WithoutId } from 'mongodb';

import { db } from '@/database';

import { IMessage, IMsgAttachment } from '@/types/message.types';
import { IUser } from '@/types/user.types';
import { IRoom } from '@/types/room.types';
import { deleteS3Objects, uploadBase64ToS3 } from '@/utils/s3';
import { getNow } from '@/utils';

const roomsCol = db.collection<WithoutId<IRoom>>('rooms');
const messagesCol = db.collection<WithoutId<IMessage>>('messages');
const msgAttachmentsCol = db.collection<WithoutId<IMsgAttachment>>('msgAttachments');

export const loadMessages = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const { id: orgId, roomId } = req.params;

    const room = await roomsCol.findOne({
      _id: new ObjectId(roomId),
      orgId: new ObjectId(orgId),
      usernames: user.username,
    });
    if (!room) {
      return res.status(404).json({ msg: 'Room not found' });
    }

    const messages = await messagesCol
      .aggregate([
        { $match: { roomId: room._id, orgId: room.orgId } },
        {
          $lookup: {
            from: 'msgAttachments',
            localField: 'attachmentIds',
            foreignField: '_id',
            as: 'attachments',
          },
        },
        { $sort: { createdAt: -1 } },
        { $limit: 20 },
      ])
      .toArray();

    return res.json(messages.sort((a, b) => a.createdAt - b.createdAt));
  } catch (error) {
    console.log('loadMessages error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const loadBeforeMessages = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const { id: orgId, roomId } = req.params;
    const { messageId } = req.query;

    const room = await roomsCol.findOne({
      _id: new ObjectId(roomId),
      orgId: new ObjectId(orgId),
      usernames: user.username,
    });
    if (!room) {
      return res.status(404).json({ msg: 'Room not found' });
    }
    const message = await messagesCol.findOne({
      _id: new ObjectId(String(messageId)),
      roomId: room._id,
    });
    if (!message) {
      return res.status(404).json({ msg: 'Message not found' });
    }

    const messages = await messagesCol
      .aggregate([
        { $match: { roomId: room._id, orgId: room.orgId, createdAt: { $lt: message.createdAt } } },
        {
          $lookup: {
            from: 'msgAttachments',
            localField: 'attachmentIds',
            foreignField: '_id',
            as: 'attachments',
          },
        },
        { $sort: { createdAt: -1 } },
        { $limit: 20 },
      ])
      .toArray();

    return res.json(messages.sort((a, b) => a.createdAt - b.createdAt));
  } catch (error) {
    console.log('loadBeforeMessages error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const loadNextMessages = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const { id: orgId, roomId } = req.params;
    const { messageId } = req.query;

    const room = await roomsCol.findOne({
      _id: new ObjectId(roomId),
      orgId: new ObjectId(orgId),
      usernames: user.username,
    });
    if (!room) {
      return res.status(404).json({ msg: 'Room not found' });
    }
    const message = await messagesCol.findOne({
      _id: new ObjectId(String(messageId)),
      roomId: room._id,
    });
    if (!message) {
      return res.status(404).json({ msg: 'Message not found' });
    }

    const messages = await messagesCol
      .aggregate([
        { $match: { roomId: room._id, orgId: room.orgId, createdAt: { $gt: message.createdAt } } },
        {
          $lookup: {
            from: 'msgAttachments',
            localField: 'attachmentIds',
            foreignField: '_id',
            as: 'attachments',
          },
        },
        { $sort: { createdAt: -1 } },
        { $limit: 20 },
      ])
      .toArray();

    return res.json(messages.sort((a, b) => a.createdAt - b.createdAt));
  } catch (error) {
    console.log('loadNextMessages error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const searchMessages = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const { id: orgId, roomId } = req.params;
    const { search } = req.query;

    if (!search) {
      return res.status(400).json({ msg: 'Bad request' });
    }

    const room = await roomsCol.findOne({
      _id: new ObjectId(roomId),
      orgId: new ObjectId(orgId),
      usernames: user.username,
    });
    if (!room) {
      return res.status(404).json({ msg: 'Room not found' });
    }

    const match = {
      roomId: room._id,
      orgId: room.orgId,
      msg: {
        $regex: String(search)
          .trim()
          .replace(/[-[\]{}()*+?.,\\/^$|#\s]/g, '\\$&'),
        $options: 'i',
      },
    };

    const messages = await messagesCol
      .aggregate([
        {
          $match: match,
        },
        {
          $lookup: {
            from: 'msgAttachments',
            localField: 'attachmentIds',
            foreignField: '_id',
            as: 'attachments',
          },
        },
        { $sort: { createdAt: -1 } },
        { $limit: 100 },
      ])
      .toArray();

    return res.json(messages.sort((a, b) => a.createdAt - b.createdAt));
  } catch (error) {
    console.log('load more messages error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const loadSearchedessages = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const { id: orgId, roomId } = req.params;
    const { messageId } = req.query;

    const room = await roomsCol.findOne({
      _id: new ObjectId(roomId),
      orgId: new ObjectId(orgId),
      usernames: user.username,
    });
    if (!room) {
      return res.status(404).json({ msg: 'Room not found' });
    }
    const message = await messagesCol.findOne({
      _id: new ObjectId(String(messageId)),
      roomId: room._id,
    });
    if (!message) {
      return res.status(404).json({ msg: 'Message not found' });
    }

    const beforeMessages = await messagesCol
      .aggregate([
        { $match: { roomId: room._id, orgId: room.orgId, createdAt: { $lt: message.createdAt } } },
        {
          $lookup: {
            from: 'msgAttachments',
            localField: 'attachmentIds',
            foreignField: '_id',
            as: 'attachments',
          },
        },
        { $sort: { createdAt: -1 } },
        { $limit: 3 },
      ])
      .toArray();

    const messages = await messagesCol
      .aggregate([
        { $match: { roomId: room._id, orgId: room.orgId, createdAt: { $gte: message.createdAt } } },
        {
          $lookup: {
            from: 'msgAttachments',
            localField: 'attachmentIds',
            foreignField: '_id',
            as: 'attachments',
          },
        },
        { $sort: { createdAt: -1 } },
        // { $limit: 20 },
      ])
      .toArray();

    return res.json([...beforeMessages, ...messages].sort((a, b) => a.createdAt - b.createdAt));
  } catch (error) {
    console.log('loadSearchedessages error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const addAttachment = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const { id: orgId, roomId } = req.params;

    const room = await roomsCol.findOne({
      _id: new ObjectId(roomId),
      orgId: new ObjectId(orgId),
      usernames: user.username,
    });
    if (!room) {
      return res.status(404).json({ msg: 'Room not found' });
    }

    const { name, base64, mimetype, size = 0 } = req.body;
    if (!name || !base64 || !mimetype || !size) {
      return res.status(400).json({ msg: 'Bad request' });
    }

    const names = name.split('.');

    const { url, s3Key } = await uploadBase64ToS3('attachments', names[0], base64, mimetype, names[names.length - 1]);

    const data: WithoutId<IMsgAttachment> = {
      roomId: room._id,
      name,
      url,
      s3Key,
      mimetype,
      size,
      timestamp: getNow(),
      creator: user.username,
    };

    const newAttachment = await msgAttachmentsCol.insertOne(data);

    return res.json({ ...data, _id: newAttachment.insertedId });
  } catch (error) {
    console.log('addAttachment error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const deleteAttachment = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const { id: orgId, roomId, attachmentId } = req.params;

    const room = await roomsCol.findOne({
      _id: new ObjectId(roomId),
      orgId: new ObjectId(orgId),
      usernames: user.username,
    });
    if (!room) {
      return res.status(404).json({ msg: 'Room not found' });
    }

    const msgAttachment = await msgAttachmentsCol.findOne({
      _id: new ObjectId(attachmentId),
      roomId: room._id,
      creator: user.username,
    });
    if (!msgAttachment) {
      return res.status(404).json({ msg: 'Not found file' });
    }

    if (!msgAttachment.linkedFrom) {
      await deleteS3Objects([msgAttachment.s3Key]);
    }

    await msgAttachmentsCol.deleteOne({ _id: msgAttachment._id });

    return res.json({ msg: 'delete success' });
  } catch (error) {
    console.log('deleteAttachment error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
