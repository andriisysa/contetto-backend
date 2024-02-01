import type { Request, Response } from 'express';
import { WithoutId } from 'mongodb';

import { db } from '@/database';
import { compareHash } from '@/utils/hash';
import { setResponseHeader } from '@/middlewares/auth';
import { IUser } from '@/types/user.types';

const usersCol = db.collection<WithoutId<IUser>>('users');

export const adminLogin = async (req: Request, res: Response) => {
  try {
    let { username, password } = req.body;
    username = String(username).toLowerCase().trim();

    const user = await usersCol.findOne({ username, verified: true });
    if (!user) {
      return res.status(404).json({ msg: 'user not found' });
    }

    if (!user.isAdmin) {
      return res.status(400).json({ msg: 'Permission deined' });
    }

    if (user && (await compareHash(password, user.password))) {
      if (await setResponseHeader(res, user)) {
        return res.json(user);
      }

      return res.status(500).json({ msg: 'Server error' });
    }

    return res.status(400).json({ msg: 'Password incorrect' });
  } catch (error) {
    console.log('login ===>', error);
    return res.status(500).json({ msg: 'login failed' });
  }
};

export const adminGetMe = async (req: Request, res: Response) => {
  return res.json(req.user);
};
