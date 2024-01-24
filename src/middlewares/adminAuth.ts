import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@/utils/jwt';
import { setResponseHeader } from './auth';

const adminAuth = async (req: Request, res: Response, next: NextFunction) => {
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
    user = verifyToken(refreshToken);
    if (!user) {
      return res.status(401).json({ msg: 'Token expired' });
    }

    // reset header
    if (!(await setResponseHeader(res, user))) {
      return res.status(500).json({ msg: 'Server error' });
    }
  }

  if (!user.isAdmin) {
    return res.status(400).json({ msg: "YOu don't have permission to access" });
  }

  req.user = user;

  await next();
};

export default adminAuth;
