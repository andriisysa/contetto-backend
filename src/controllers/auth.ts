import type { Request, Response } from 'express';
import { WithoutId } from 'mongodb';

import { db } from '@/database';
import { compareHash, encrypt } from '@/utils/hash';
import { setResponseHeader } from '@/middlewares/auth';
import { IUser } from '@/types/user.types';

import { getNow, getRandomDigits } from '@/utils';
import { sendEmail } from '@/utils/email';
import { createOrg } from './orgs';
import { IOrg } from '@/types/org.types';
import { IIndustry } from '@/types/industry.types';
import { IAgentProfile } from '@/types/agentProfile.types';
import { IContact } from '@/types/contact.types';
import { IRoom } from '@/types/room.types';
import { IFile, IFolder } from '@/types/folder.types';
import { getImageExtension } from '@/utils/extension';
import { uploadBase64ToS3 } from '@/utils/s3';

const usersCol = db.collection<WithoutId<IUser>>('users');
const industriesCol = db.collection<WithoutId<IIndustry>>('industries');
const orgsCol = db.collection<WithoutId<IOrg>>('orgs');
const agentProfilesCol = db.collection<WithoutId<IAgentProfile>>('agentProfiles');
const contactsCol = db.collection<WithoutId<IContact>>('contacts');
const roomsCol = db.collection<WithoutId<IRoom>>('rooms');
const foldersCol = db.collection<WithoutId<IFolder>>('folders');
const filesCol = db.collection<WithoutId<IFile>>('files');

export const singup = async (req: Request, res: Response) => {
  try {
    let { username, email, password } = req.body;
    username = String(username).toLowerCase().trim();
    if (username.includes(' ')) {
      return res.status(400).json({ msg: 'Username should not include space' });
    }
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
      const generalIndustry = await industriesCol.findOne({ name: 'General' });
      const orgData: WithoutId<IOrg> = {
        name: `${user.username}'s personal org`,
        owner: user.username,
        industryId: generalIndustry!._id,
        logoUrl: '',
        mlsFeeds: [],
        createdAt: getNow(),
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

    const user = await usersCol.findOne({ username, verified: true, deleted: false });
    if (!user) {
      return res.status(404).json({ msg: 'user not found' });
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

export const getMe = async (req: Request, res: Response) => {
  return res.json(req.user);
};

export const update = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;

    let { name, image = '', imageFileType } = req.body;
    if (image && imageFileType) {
      const imageExtension = getImageExtension(imageFileType);
      if (!imageExtension) {
        return res.status(400).json({ msg: 'Invalid image type' });
      }

      const { url } = await uploadBase64ToS3('orgs', String(name).split(' ')[0], image, imageFileType, imageExtension);
      image = url;
    }

    const updateData: Partial<IUser> = {
      name,
      image,
    };

    await usersCol.updateOne({ username: user.username }, { $set: updateData });

    await agentProfilesCol.updateMany(
      { username: user.username },
      {
        $set: {
          userDisplayName: name,
          userImage: image,
        },
      }
    );
    await roomsCol.updateMany(
      { 'agents.username': user.username },
      {
        $set: {
          'agents.$.userDisplayName': name,
          'agents.$.userImage': image,
        },
      }
    );

    await contactsCol.updateMany(
      {
        username: user.username,
      },
      {
        $set: {
          userImage: image,
        },
      }
    );
    await roomsCol.updateMany(
      { 'contacts.username': user.username },
      {
        $set: {
          'contacts.$.userImage': image,
        },
      }
    );

    if (await setResponseHeader(res, { ...user, ...updateData })) {
      return res.json({ ...user, ...updateData });
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

export const forgotUsername = async (req: Request, res: Response) => {
  try {
    let { email } = req.body;
    email = String(email).trim();

    const user = await usersCol.findOne({ 'emails.email': email });
    if (!user) {
      return res.status(404).json({ msg: 'User doesn not exist' });
    }

    await sendEmail(email, 'Your Username', `Your Username is ${user.username}.`);

    return res.json({ msg: 'Sent username via email' });
  } catch (error: any) {
    console.log('forgot password error ===>', error);
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

export const deleteAccount = async (req: Request, res: Response) => {
  try {
    const curUser = req.user as IUser;
    let { password } = req.body;

    const user = await usersCol.findOne({ username: curUser.username, verified: true });
    if (!user) {
      return res.status(404).json({ msg: 'user not found' });
    }

    if (user && (await compareHash(password, user.password))) {
      // orgs
      const orgs = await orgsCol.find({ owner: user.username, deleted: false }).toArray();
      const agentProfile = await agentProfilesCol.find({ username: user.username }).toArray();
      const contacts = await contactsCol.find({ username: user.username }).toArray();

      await usersCol.updateOne({ username: user.username }, { $set: { deleted: true } });

      return res.json({ msg: 'success' });
    }

    return res.status(400).json({ msg: 'Password incorrect' });
  } catch (error) {
    console.log('deleteAccount ===>', error);
    return res.status(500).json({ msg: 'login failed' });
  }
};
