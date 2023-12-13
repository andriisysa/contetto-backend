import type { Request, Response } from 'express';
import { ObjectId, WithoutId } from 'mongodb';

import { db } from '@/database';

import { IMessage } from '@/types/message.types';
import { IUser } from '@/types/user.types';
import { IRoom } from '@/types/room.types';

const roomsCol = db.collection<WithoutId<IRoom>>('rooms');
const messagesCol = db.collection<WithoutId<IMessage>>('messages');

export const getAllMessages = async (req: Request, res: Response) => {
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

    const messages = await messagesCol.find({ roomId: room._id, orgId: room.orgId }).toArray();

    return res.json(messages);
  } catch (error) {
    console.log('getAllMessages error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
