import type { Request, Response } from 'express';
import { randomInt } from 'crypto';
import { WithoutId } from 'mongodb';

import { db } from '@/database';
import { compareHash, encrypt } from '@/utils/hash';
import { setResponseHeader } from '@/middlewares/auth';
import { IUser } from '@/types/user.types';

import { getNow, getRandomDigits } from '@/utils';
import { sendEmail } from '@/utils/email';
import { createOrg } from './orgs';
import { IOrg } from '@/types/org.types';

const usersCol = db.collection<WithoutId<IUser>>('users');

export const singup = async (req: Request, res: Response) => {
  try {
    let { username, email, password } = req.body;
    username = String(username).toLowerCase().trim();
    email = String(email).trim();
    password = await encrypt(password);
    const verificationCode = getRandomDigits(4);

    await usersCol.deleteMany({ username, verified: false });
    let user = await usersCol.findOne({ username });
    if (user) {
      return res.status(400).json({ msg: 'Username is already taken' });
    }

    user = await usersCol.findOne({ 'emails.email': email });
    if (user) {
      return res.status(400).json({ msg: 'Email is already taken' });
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
      deleted: false,
    };

    await usersCol.insertOne(userData);

    return res.json({ msg: 'sign up success' });
  } catch (error: any) {
    console.log('signup error ===>', error);
    return res.status(500).json({ msg: `sign up failed: ${error.message}` });
  }
};

export const confirmEmail = async (req: Request, res: Response) => {
  try {
    let { username, email, verificationCode, orgNeeded = false } = req.body;
    username = String(username).toLowerCase().trim();
    email = String(email).trim();

    const user = await usersCol.findOne<IUser>({ username });
    if (!user) {
      return res.status(404).json({ msg: 'User does not exist' });
    }

    // todo: check expiration

    if (user.verificationCode !== verificationCode) {
      return res.status(400).json({ msg: 'Verification code is not correct' });
    }

    await usersCol.updateOne(
      { username, 'emails.email': email },
      { $set: { verified: true, 'emails.$.verified': true } }
    );

    if (orgNeeded) {
      const orgData: WithoutId<IOrg> = {
        name: `${user.username}'s personal org`,
        owner: user.username,
        primaryColor: '',
        secondaryColor: '',
        logoUrl: '',
        mlsFeeds: [],
        deleted: false,
      };

      await createOrg(user, orgData);
    }

    return res.json({ msg: 'You are verified now!' });
  } catch (error: any) {
    console.log('confirmEmail error ===>', error);
    return res.status(500).json({ msg: `Email confirmation failed: ${error.message}` });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    let { username, password } = req.body;
    username = String(username).toLowerCase().trim();

    const user = await usersCol.findOne({ username, verified: true });
    if (!user) {
      return res.status(404).json({ msg: 'user not found' });
    }

    if (user && (await compareHash(password, user.password))) {
      if (await setResponseHeader(res, user)) {
        return res.json(user);
      }

      return res.status(500).json({ msg: 'Server error' });
    }

    return res.status(404).json({ msg: 'Password incorrect' });
  } catch (error) {
    console.log('login ===>', error);
    return res.status(500).json({ msg: 'login failed' });
  }
};

export const getMe = async (req: Request, res: Response) => {
  return res.json(req.user);
};

export const update = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;

    const { name } = req.body;

    await usersCol.updateOne({ username: user.username }, { $set: { name } });

    if (await setResponseHeader(res, { ...user, name })) {
      return res.json({ ...user, name });
    }

    return res.status(500).json({ msg: 'Server error' });
  } catch (error: any) {
    console.log('signup error ===>', error);
    return res.status(500).json({ msg: `sign up failed: ${error.message}` });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    let { email } = req.body;
    email = String(email).trim();

    const user = await usersCol.findOne({ 'emails.email': email });
    if (!user) {
      return res.status(404).json({ msg: 'User doesn not exist' });
    }

    const verificationCode = getRandomDigits(4);

    await sendEmail(
      email,
      'Confirm email',
      `Your verification code is ${verificationCode}. It will be expired in 1 hour`
    );

    await usersCol.updateOne({ 'emails.email': email }, { $set: { verificationCode, updatedAt: getNow() } });

    return res.json({ msg: 'Sent email with verification code!' });
  } catch (error: any) {
    console.log('forgot password error ===>', error);
    return res.status(500).json({ msg: `Failed: ${error.message}` });
  }
};

export const forgotPasswordConfirm = async (req: Request, res: Response) => {
  try {
    let { email, verificationCode, password } = req.body;
    email = String(email).trim();

    const user = await usersCol.findOne({ 'emails.email': email });
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // todo: check expiration

    if (user.verificationCode !== verificationCode) {
      return res.status(400).json({ msg: 'Verification code incorrect!' });
    }

    password = await encrypt(password);

    await usersCol.updateOne({ 'emails.email': email }, { $set: { password } });

    return res.json({ msg: 'Password updated' });
  } catch (error: any) {
    console.log('forgotPasswordConfirm error ===>', error);
    return res.status(500).json({ msg: `Failed: ${error.message}` });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;

    const { oldPassword, newPassword } = req.body;

    if (await compareHash(oldPassword, user.password)) {
      const password = await encrypt(newPassword);

      await usersCol.updateOne({ username: user.username }, { $set: { password: String(password) } });

      return res.json({ msg: 'Password updated' });
    }

    return res.status(400).json({ msg: 'Password incorrect!' });
  } catch (error: any) {
    console.log('resetPassword error ===>', error);
    return res.status(500).json({ msg: `Failed: ${error.message}` });
  }
};
