import type { Request, Response } from 'express';
import { db } from '../database';
import { compareHash, encrypt } from '../utils/hash';
import { setResponseHeader } from '../middlewares/auth';
import { IUser } from '../types/user.types';
import { randomInt } from 'crypto';
import { WithoutId } from 'mongodb';
import { getNow } from '../utils';
import { sendEmail } from '../utils/email';

const usersCol = db.collection<WithoutId<IUser>>('users');

export const singup = async (req: Request, res: Response) => {
  try {
    let { username, email, password } = req.body;
    username = String(username).toLowerCase();
    password = await encrypt(password);
    const verificationCode = randomInt(100000, 999999);

    await usersCol.deleteMany({ username, verified: false });
    const user = await usersCol.findOne({ username });
    if (user) {
      return res.status(400).json({ msg: 'Username is already taken' });
    }

    await sendEmail(
      email,
      'Confirm email',
      `Your verification code is ${verificationCode}. It will be expired in 1 hour`
    );

    const userData: WithoutId<IUser> = {
      username,
      password,
      emails: [
        {
          email,
          verified: false,
          primary: true,
        },
      ],
      verificationCode,
      verified: false,
      createdAt: getNow(),
      updatedAt: getNow(),
    };

    await usersCol.insertOne(userData);

    return res.json({ msg: 'sign up success' });
  } catch (error: any) {
    console.log('signup error ===>', error);
    return res.status(400).json({ msg: `sign up failed: ${error.message}` });
  }
};

export const confirmEmail = async (req: Request, res: Response) => {
  try {
    let { username, email, verificationCode } = req.body;
    username = String(username).toLowerCase();

    const user = await usersCol.findOne<IUser>({ username });
    if (!user) {
      return res.status(404).json({ msg: 'User does not exist' });
    }

    if (user.verificationCode !== verificationCode) {
      return res.status(400).json({ msg: 'Verification code is not correct' });
    }

    await usersCol.updateOne(
      { username, 'emails.email': email },
      { $set: { verified: true, 'emails.$.verified': true } }
    );

    return res.json({ msg: 'You are verified now!' });
  } catch (error: any) {
    console.log('signup error ===>', error);
    return res.status(400).json({ msg: `sign up failed: ${error.message}` });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    const user = await usersCol.findOne({ username, verified: true });

    if (user && (await compareHash(password, user.password))) {
      if (await setResponseHeader(res, user)) {
        return res.json(user);
      }

      return res.status(500).json({ msg: 'Server error' });
    }

    return res.status(404).json({ msg: 'user not found' });
  } catch (error) {
    console.log('login ===>', error);
    return res.status(400).json({ msg: 'login failed' });
  }
};

export const invite = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    return res.status(404).json({ msg: 'user not found' });
  } catch (error) {
    console.log('login ===>', error);
    return res.status(400).json({ msg: 'login failed' });
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    let { username, password } = req.body;

    return res.json({ msg: 'sign up success' });
  } catch (error: any) {
    console.log('signup error ===>', error);
    return res.status(400).json({ msg: `sign up failed: ${error.message}` });
  }
};

export const getMe = async (req: Request, res: Response) => {
  return res.json(req.user);
};
