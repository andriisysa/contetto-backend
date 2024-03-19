import type { Request, Response, NextFunction } from 'express';
import { IUser } from '@/types/user.types';
import { generateTokens, verifyToken } from '@/utils/jwt';
import { db } from '@/database';
import { WithoutId } from 'mongodb';

const usersCol = db.collection<WithoutId<IUser>>('users');

export const setResponseHeader = async (res: Response, user: IUser) => {
  const token = await generateTokens(user);
  if (token) {
    res.set('token', token);
    return true;
  }
  return false;
};

const auth = async (req: Request, res: Response, next: NextFunction) => {
  let token = req.headers.Authorization || req.headers.authorization;

  if (!token || token === undefined) {
    return res.status(401).json({ msg: 'Bad Authorization header' });
  }

  token = (token as string).replace('Bearer ', '');

  const accessToken = token.split(' ')[0];
  const refreshToken = token.split(' ')[1];

  if (!accessToken || !refreshToken) {
    return res.status(401).json({ msg: 'Bad Authorization header' });
  }

  // clear token in header
  res.set('token', '');

  // getting user info from token
  let user = verifyToken(accessToken);
  if (!user) {
    return res.status(401).json({ msg: 'Token expired' });
    // user = verifyToken(refreshToken);
    // if (!user) {
    //   return res.status(401).json({ msg: 'Token expired' });
    // }

    // // reset header
    // if (!(await setResponseHeader(res, user))) {
    //   return res.status(500).json({ msg: 'Server error' });
    // }
  }

  user = await usersCol.findOne({ username: user.username, deleted: false });
  if (!user) {
    return res.status(404).json({ msg: 'Not found user' });
  }

  req.user = user;

  await next();
};

export default auth;
