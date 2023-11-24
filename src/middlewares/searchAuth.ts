import type { Request, Response, NextFunction } from 'express';
import { IUser } from '@/types/user.types';
import { db, searchDB } from '@/database';
import { ObjectId, WithoutId } from 'mongodb';
import { ISearchResult } from '@/types/search.types';
import { IContact } from '@/types/contact.types';
import { IAgentProfile } from '@/types/agentProfile.types';
import { IOrg } from '@/types/org.types';

const searchResultsCol = db.collection<WithoutId<ISearchResult>>('searchResults');
const agentProfilesCol = db.collection<WithoutId<IAgentProfile>>('agentProfiles');
const contactsCol = db.collection<WithoutId<IContact>>('contacts');
const orgsCol = db.collection<WithoutId<IOrg>>('orgs');

export const searchAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id: orgId } = req.params;
    const { contactId } = req.query; // contact should send contactId in the request

    const org = await orgsCol.findOne({ _id: new ObjectId(orgId), deleted: false });
    if (!org) {
      return res.status(404).json({ msg: 'No org found' });
    }

    let agentProfile: IAgentProfile | undefined = undefined;
    let contact: IContact | undefined = undefined;

    if (contactId) {
      contact = (await contactsCol.findOne({
        _id: new ObjectId(String(contactId)),
        username: user.username,
        orgId: org._id,
      })) as IContact;
    } else {
      agentProfile = (await agentProfilesCol.findOne({
        username: user.username,
        orgId: org._id,
        deleted: false,
      })) as IAgentProfile;
    }

    if (!contact && !agentProfile) {
      return res.status(400).json({ msg: 'permissin denied' });
    }

    req.agentProfile = agentProfile;
    req.contact = contact;

    await next();
  } catch (error) {
    console.log('searchAuth error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const searchResultAuth =
  (contactAccessbile: boolean = true) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user as IUser;
      const { id: orgId, searchId } = req.params;

      if (!orgId || !searchId) {
        return res.status(401).json({ msg: 'Invalid request' });
      }

      const searchResults = await searchResultsCol
        .aggregate<ISearchResult>([
          {
            $match: {
              _id: new ObjectId(searchId),
              orgId: new ObjectId(orgId),
            },
          },
          {
            $lookup: {
              from: 'agentProfiles',
              localField: 'agentProfileId',
              foreignField: '_id',
              // pipeline: [
              //   {
              //     $match: {
              //       deleted: false,
              //     },
              //   },
              // ],
              as: 'agentProfile',
            },
          },
          {
            $lookup: {
              from: 'contacts',
              localField: 'contactId',
              foreignField: '_id',
              as: 'contact',
            },
          },
          {
            $unwind: {
              path: '$agentProfile',
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $unwind: {
              path: '$contact',
              preserveNullAndEmptyArrays: true,
            },
          },
        ])
        .toArray();

      if (searchResults.length === 0) {
        return res.status(404).json({ msg: 'No search result' });
      }

      const searchResult = searchResults[0];

      // if not the same user whether it's agent or contact
      if (user.username !== searchResult.username) {
        if (contactAccessbile) {
          if (!searchResult.contact || searchResult.contact.username !== user.username) {
            return res.status(404).json({ msg: 'No search result' });
          }
        } else {
          return res.status(404).json({ msg: 'No search result' });
        }
      }

      req.searchResult = searchResult;

      await next();
    } catch (error) {
      console.log('searchResultAuth error ===>', error);
      return res.status(500).json({ msg: 'Server error' });
    }
  };
