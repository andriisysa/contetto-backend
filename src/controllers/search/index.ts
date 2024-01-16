import dotenv from 'dotenv';
import type { Request, Response } from 'express';
import axios from 'axios';
import { db } from '@/database';
import { ObjectId, WithoutId } from 'mongodb';
import { template } from 'lodash';
import { ISearchResult, IUserQueryJson, NearBy, Operator } from '@/types/search.types';
import { IAgentProfile } from '@/types/agentProfile.types';
import { getNow, getRandomString } from '@/utils';
import { IContact } from '@/types/contact.types';
import { IUser } from '@/types/user.types';
import { ICity } from '@/types/city.types';
import { AreaUnit, acresToHectares, acresToSqft, acresToSqm, sqftToAcres, sqftToSqm } from '@/utils/sq';
import { IRoom, RoomType } from '@/types/room.types';
import { IMessage, ServerMessageType } from '@/types/message.types';
import { io } from '@/socketServer';
import { sendEmail } from '@/utils/email';
import { sharePropertyTemplate } from '@/utils/email-templates';

dotenv.config();

const usersCol = db.collection<WithoutId<IUser>>('users');
const listingsCol = db.collection('mlsListings');
const searchResultsCol = db.collection<WithoutId<ISearchResult>>('searchResults');
const contactsCol = db.collection<WithoutId<IContact>>('contacts');
const citiesCol = db.collection<WithoutId<ICity>>('cities');
const roomsCol = db.collection<WithoutId<IRoom>>('rooms');
const messagesCol = db.collection<WithoutId<IMessage>>('messages');

const SERACH_LIMIT = 12;
const MAX_RANGE = 100;
const NEAR_BY_DISTANCE = 5 * 1000;
const WALKING_DISTANCE = 400;
const MIN_PRICE = 100000;
const MAX_PRICE = 2000000;
const MAX_SQFT = 10000;
const MAX_LOT_ACRES = 50;

const processValue = (apiResponseData: any) => {
  let value = apiResponseData.choices && apiResponseData.choices[0].message.content;
  value = value.trim();

  try {
    value = JSON.parse(value);
  } catch (e) {
    value = JSON.parse(value.replace(/"/g, "'"));
  }

  return value;
};

export const searchListings = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const agentProfile = req.agentProfile;
    const contact = req.contact;

    const {
      search: userQuery = '',
      keywords,
      cityId,
      range,
      mls,
      listedSince,

      price,
      sqft,
      lotAcres,
      minYearBuilt,
      maxYearBuilt,

      rooms,
      roomsOperator,
      bathrooms,
      bathroomsOperator,
      storeys,
      storeysOperator,
      firePlaces,
      firePlacesOperator,
      parkingSpaces,
      parkingSpacesOperator,

      propertyType,
      walkingDistance,
    } = req.query;

    // make city geo query
    if (!cityId || !Number(range)) {
      return res.status(400).json({ msg: 'Bad request, No city selected' });
    }

    let cityQuery: any = {};
    const city = await citiesCol.findOne({ _id: new ObjectId(String(cityId)) });
    if (!city) {
      return res.status(400).json({ msg: 'Bad request, No city found' });
    } else {
      cityQuery = {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [city.lng, city.lat],
          },
          distanceField: 'distance',
          maxDistance: (Number(range) > MAX_RANGE ? MAX_RANGE : Number(range)) * 1000,
          spherical: true,
        },
      };
    }

    // ============== make userQueryJson (including gpt query) ==============
    let userQueryJson: IUserQueryJson = {
      cityId: city._id,
      range: String(range),
      city,
    };

    // gpt query if userQuery exists
    if (userQuery) {
      const searchResult = await searchResultsCol.findOne({
        orgId: agentProfile?.orgId || contact?.orgId,
        userQueryString: userQuery,
        gptValid: true,
      });

      if (searchResult) {
        userQueryJson = { ...searchResult.userQueryJson, ...userQueryJson };
      } else {
        const chatGPTInput = {
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `
                  You are tasked with translating natural language search queries into Nodejs JSON Object format to fill the filterable options for real-estate search.
                  Here are the options for it:

                  'mls': string value and representing property id.
                  'listedSince': unix timstamp representing the time when the property is listed
                  
                  'price': number array contains min, max price. the min, max limit is [100000, 2000000].
                      example: if user types "under/less than $5m" or "under/less than 5m", then the max limit is 2000000 so the expected results should be [100000, 2000000]
                              if user types "under/less $1m", then the expected results should be [100000, 1000000]
                              if user types "more than $1m", then the expected results should be [1000000, 2000000]
                  'sqft': number array contains min, max building area in square feet. the min, max limit is [0, 10000]
                  'lotAcres': number array contains min, max lot acres. the min, max limit is [0, 50]
                  'minYearBuilt' and 'maxYearBuilt: number of min, max year range when the property was built. the min limit is 1900 and the max limit is current year

                  'rooms' and 'roomsOperator':
                    'rooms': number of bedrooms
                    'roomsOperator': representing how to operate number of rooms and avaialbe values are '=', '>' and '<'
                    example: "2 rooms" or "2 bedrooms", then 'rooms' is 2 and 'roomsOperator' is '='
                            "more than 2 rooms" or "more than 2 bedrooms", then 'rooms' is 2 and 'roomsOperator' is '>'
                            "less than 2 rooms" or "less than 2 bedrooms", then 'rooms' is 2 and 'roomsOperator' is '<'
                  'bathrooms' and 'bathroomsOperator':
                    'bathrooms': number of bathrooms
                    'bathroomsOperator': representing how to operate number of bathrooms and avaialbe values are '=', '>' and '<'
                  'storeys' and 'storeysOperator':
                    'storeys': number of storeys
                    'storeysOperator': representing how to operate number of storeys and avaialbe values are '=', '>' and '<'
                  'firePlaces' and 'firePlacesOperator':
                    'firePlaces': number of firePlacesOperator
                    'firePlacesOperator': representing how to operate number of firePlaces and avaialbe values are '=', '>' and '<'
                  'parkingSpaces' and 'parkingSpacesOperator':
                    'parkingSpaces': number of parkingSpacesOperator
                    'parkingSpacesOperator': representing how to operate number of parkingSpaces and avaialbe values are '=', '>' and '<'

                  'propertyType': string array. avaialble values are 'Condo', 'House' and 'Other'. no other values
                  'walkingDistance': string array. avaialble values are 'School', 'Park' and 'Medical Facility'. no other values
                    example: "nearby school", then ['School']

                  Make sure the response does not contain the variable definition or trailing semicolon.
                  I will be using json_decode to turn your response into the Json Object.
                  Your task is to convert the following natural language query into a Javascript JSON Object Format.
                  Make sure it the format can be parsed into a Json Object by Node.js JSON.parse function
                `,
            },
            { role: 'user', content: userQuery },
          ],
        };

        const apiEndpoint = 'https://api.openai.com/v1/chat/completions';
        const apiResponse = await axios.post(apiEndpoint, chatGPTInput, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.CHATGPT_KEY}`,
          },
        });

        const obj = processValue(apiResponse.data);
        if (obj.mls) {
          userQueryJson.mls = obj.mls;
        }
        if (obj.listedSince) {
          userQueryJson.listedSince = obj.listedSince;
        }
        if (obj.price) {
          userQueryJson.price = obj.price;
        }
        if (obj.sqft) {
          userQueryJson.sqft = obj.sqft;
        }
        if (obj.lotAcres) {
          userQueryJson.lotAcres = obj.lotAcres;
        }
        if (obj.minYearBuilt) {
          userQueryJson.minYearBuilt = obj.minYearBuilt;
        }
        if (obj.maxYearBuilt) {
          userQueryJson.maxYearBuilt = obj.maxYearBuilt;
        }
        if (obj.rooms && obj.roomsOperator) {
          userQueryJson.rooms = obj.rooms;
          userQueryJson.roomsOperator = obj.roomsOperator as Operator;
        }
        if (obj.bathrooms && obj.bathroomsOperator) {
          userQueryJson.bathrooms = obj.bathrooms;
          userQueryJson.bathroomsOperator = obj.bathroomsOperator as Operator;
        }
        if (obj.storeys && obj.storeysOperator) {
          userQueryJson.storeys = obj.storeys;
          userQueryJson.storeysOperator = obj.storeysOperator as Operator;
        }
        if (obj.firePlaces && obj.firePlacesOperator) {
          userQueryJson.firePlaces = obj.firePlaces;
          userQueryJson.firePlacesOperator = obj.firePlacesOperator as Operator;
        }
        if (obj.parkingSpaces && obj.parkingSpacesOperator) {
          userQueryJson.parkingSpaces = obj.parkingSpaces;
          userQueryJson.parkingSpacesOperator = obj.parkingSpacesOperator as Operator;
        }
        if (obj.propertyType) {
          userQueryJson.propertyType = obj.propertyType;
        }
        if (obj.walkingDistance) {
          userQueryJson.walkingDistance = obj.walkingDistance;
        }
      }
    }

    if (mls) {
      userQueryJson.mls = String(mls);
    }
    if (keywords) {
      userQueryJson.keywords = String(mls).split(', ');
    }
    if (Number(listedSince)) {
      userQueryJson.listedSince = Number(listedSince);
    }
    if (price) {
      const prices = String(price)
        .split(',')
        .map((p) => Number(p));
      userQueryJson.price = prices;
    }
    if (sqft) {
      userQueryJson.sqft = String(sqft)
        .split(',')
        .map((s) => Number(s));
    }
    if (lotAcres) {
      userQueryJson.lotAcres = String(lotAcres)
        .split(',')
        .map((l) => Number(l));
    }
    if (minYearBuilt) {
      userQueryJson.minYearBuilt = Number(minYearBuilt);
    }
    if (maxYearBuilt) {
      userQueryJson.maxYearBuilt = Number(maxYearBuilt);
    }
    if (Number(rooms) && roomsOperator) {
      userQueryJson.rooms = Number(rooms);
      userQueryJson.roomsOperator = String(roomsOperator) as Operator;
    }
    if (Number(bathrooms) && bathroomsOperator) {
      userQueryJson.bathrooms = Number(bathrooms);
      userQueryJson.bathroomsOperator = String(bathroomsOperator) as Operator;
    }
    if (Number(storeys) && storeysOperator) {
      userQueryJson.storeys = Number(storeys);
      userQueryJson.storeysOperator = String(storeysOperator) as Operator;
    }
    if (Number(firePlaces) && firePlacesOperator) {
      userQueryJson.firePlaces = Number(firePlaces);
      userQueryJson.firePlacesOperator = String(firePlacesOperator) as Operator;
    }
    if (Number(parkingSpaces) && parkingSpacesOperator) {
      userQueryJson.parkingSpaces = Number(parkingSpaces);
      userQueryJson.parkingSpacesOperator = String(parkingSpacesOperator) as Operator;
    }
    if (propertyType) {
      userQueryJson.propertyType = String(propertyType).split(',') as ('Condo' | 'House' | 'Other')[];
    }
    if (walkingDistance) {
      userQueryJson.walkingDistance = String(walkingDistance).split(',') as NearBy[];
    }

    // ============== make matchQuery from userQueryJson ==============
    const matchQuery: any = {
      $and: [{ ListPrice: { $ne: 0 } }, { ListPrice: { $ne: null } }],
      deleted: false,
    };

    // $and operator
    if (userQueryJson.keywords && userQueryJson.keywords.length > 0) {
      matchQuery.$and.push({
        $or: userQueryJson.keywords.reduce(
          (arr: any[], str: string) => [
            ...arr,
            {
              PublicRemarks: {
                $regex: str.trim().replace(/[-[\]{}()*+?.,\\/^$|#\s]/g, '\\$&'),
                $options: 'i',
              },
            },
          ],
          []
        ),
      });
    }
    if (userQueryJson.mls) {
      matchQuery.$and.push({
        $or: [{ ListingId: userQueryJson.mls }, { ListingKey: userQueryJson.mls }],
      });
    }
    if (userQueryJson.listedSince) {
      matchQuery.timestamp = { $gte: userQueryJson.listedSince };
    }
    if (userQueryJson.price) {
      if (userQueryJson.price[0] > MIN_PRICE) {
        matchQuery.$and.push({
          ListPrice: { $gte: userQueryJson.price[0] },
        });
      }
      if (userQueryJson.price[1] < MAX_PRICE) {
        matchQuery.$and.push({
          ListPrice: { $lte: userQueryJson.price[1] },
        });
      }
    }
    if (userQueryJson.sqft) {
      if (userQueryJson.sqft[0] > 0) {
        matchQuery.$and.push({
          $or: [
            { BuildingAreaTotal: { $gte: userQueryJson.sqft[0] }, BuildingAreaUnits: AreaUnit.sqft },
            { BuildingAreaTotal: { $gte: sqftToSqm(userQueryJson.sqft[0]) }, BuildingAreaUnits: AreaUnit.sqm },
            { BuildingAreaTotal: { $gte: sqftToAcres(userQueryJson.sqft[0]) }, BuildingAreaUnits: AreaUnit.acres },
          ],
        });
      }
      if (userQueryJson.sqft[1] < MAX_SQFT) {
        matchQuery.$and.push({
          $or: [
            { BuildingAreaTotal: { $lte: userQueryJson.sqft[1] }, BuildingAreaUnits: AreaUnit.sqft },
            { BuildingAreaTotal: { $lte: sqftToSqm(userQueryJson.sqft[1]) }, BuildingAreaUnits: AreaUnit.sqm },
            { BuildingAreaTotal: { $lte: sqftToAcres(userQueryJson.sqft[1]) }, BuildingAreaUnits: AreaUnit.acres },
          ],
        });
      }
    }
    if (userQueryJson.lotAcres) {
      if (userQueryJson.lotAcres[0] > 0) {
        matchQuery.$and.push({
          $or: [
            { LotSizeArea: { $gte: userQueryJson.lotAcres[0] }, LotSizeUnits: AreaUnit.acres },
            { LotSizeArea: { $gte: acresToSqft(userQueryJson.lotAcres[0]) }, LotSizeUnits: AreaUnit.sqft },
            { LotSizeArea: { $gte: acresToSqm(userQueryJson.lotAcres[0]) }, LotSizeUnits: AreaUnit.sqm },
            { LotSizeArea: { $gte: acresToHectares(userQueryJson.lotAcres[0]) }, LotSizeUnits: AreaUnit.hectares },
          ],
        });
      }
      if (userQueryJson.lotAcres[1] < MAX_LOT_ACRES) {
        matchQuery.$and.push({
          $or: [
            { LotSizeArea: { $lte: userQueryJson.lotAcres[1] }, LotSizeUnits: AreaUnit.acres },
            { LotSizeArea: { $lte: acresToSqft(userQueryJson.lotAcres[1]) }, LotSizeUnits: AreaUnit.sqft },
            { LotSizeArea: { $lte: acresToSqm(userQueryJson.lotAcres[1]) }, LotSizeUnits: AreaUnit.sqm },
            { LotSizeArea: { $lte: acresToHectares(userQueryJson.lotAcres[1]) }, LotSizeUnits: AreaUnit.hectares },
          ],
        });
      }
    }
    if (userQueryJson.minYearBuilt) {
      matchQuery.$and.push({
        YearBuilt: { $gte: userQueryJson.minYearBuilt },
      });
    }
    if (userQueryJson.maxYearBuilt) {
      matchQuery.$and.push({
        YearBuilt: { $lte: userQueryJson.maxYearBuilt },
      });
    }
    if (userQueryJson.rooms && userQueryJson.roomsOperator) {
      if (userQueryJson.roomsOperator === '=') {
        matchQuery.$and.push({
          BedroomsTotal: userQueryJson.rooms,
        });
      } else if (userQueryJson.roomsOperator === '>') {
        matchQuery.$and.push({
          BedroomsTotal: { $gte: userQueryJson.rooms },
        });
      } else if (userQueryJson.roomsOperator === '<') {
        matchQuery.$and.push({
          BedroomsTotal: { $lte: userQueryJson.rooms },
        });
      }
    }
    if (userQueryJson.bathrooms && userQueryJson.bathroomsOperator) {
      if (userQueryJson.bathroomsOperator === '=') {
        matchQuery.$and.push({
          BathroomsTotal: userQueryJson.bathrooms,
        });
      } else if (userQueryJson.bathroomsOperator === '>') {
        matchQuery.$and.push({
          BathroomsTotal: { $gte: userQueryJson.bathrooms },
        });
      } else if (userQueryJson.bathroomsOperator === '<') {
        matchQuery.$and.push({
          BathroomsTotal: { $lte: userQueryJson.bathrooms },
        });
      }
    }
    if (userQueryJson.storeys && userQueryJson.storeysOperator) {
      if (userQueryJson.storeysOperator === '=') {
        matchQuery.$and.push({
          Stories: userQueryJson.storeys,
        });
      } else if (userQueryJson.storeysOperator === '>') {
        matchQuery.$and.push({
          Stories: { $gte: userQueryJson.storeys },
        });
      } else if (userQueryJson.storeysOperator === '<') {
        matchQuery.$and.push({
          Stories: { $lte: userQueryJson.storeys },
        });
      }
    }
    if (userQueryJson.firePlaces && userQueryJson.firePlacesOperator) {
      if (userQueryJson.firePlacesOperator === '=') {
        matchQuery.$and.push({
          FireplacesTotal: userQueryJson.firePlaces,
        });
      } else if (userQueryJson.firePlacesOperator === '>') {
        matchQuery.$and.push({
          FireplacesTotal: { $gte: userQueryJson.firePlaces },
        });
      } else if (userQueryJson.firePlacesOperator === '<') {
        matchQuery.$and.push({
          FireplacesTotal: { $lte: userQueryJson.firePlaces },
        });
      }
    }
    if (userQueryJson.parkingSpaces && userQueryJson.parkingSpacesOperator) {
      if (userQueryJson.parkingSpacesOperator === '=') {
        matchQuery.$and.push({
          ParkingTotal: userQueryJson.parkingSpaces,
        });
      } else if (userQueryJson.parkingSpacesOperator === '>') {
        matchQuery.$and.push({
          ParkingTotal: { $gte: userQueryJson.parkingSpaces },
        });
      } else if (userQueryJson.parkingSpacesOperator === '<') {
        matchQuery.$and.push({
          ParkingTotal: { $lte: userQueryJson.parkingSpaces },
        });
      }
    }

    // $or operator
    if (userQueryJson.propertyType) {
      if (!matchQuery.$or) matchQuery.$or = [];

      if (userQueryJson.propertyType.includes('Condo')) {
        matchQuery.$or.push({
          OwnershipType: { $in: ['Strata', 'Condominium', 'Condominium/Strata', 'Leasehold Condo/Strata'] },
          $and: [
            { PublicRemarks: { $not: /.*duplex.*/i } },
            { PublicRemarks: { $not: /.*townhouse.*/i } },
            { PublicRemarks: { $not: /.*Cabin.*/i } },
            { PublicRemarks: /.*condo.*/i },
          ],
        });
      }
      if (userQueryJson.propertyType.includes('House')) {
        matchQuery.$or.push({
          OwnershipType: 'Freehold',
        });
      }
      if (userQueryJson.propertyType.includes('Other')) {
        matchQuery.$or.push({
          OwnershipType: {
            $nin: ['Condominium', 'Condominium/Strata', 'Leasehold Condo/Strata', 'Freehold'],
          },
        });
      }
    }

    // get nearby queries
    const lookupQueries: any[] = [];
    if (userQueryJson.walkingDistance) {
      if (userQueryJson.walkingDistance.includes(NearBy.schools)) {
        lookupQueries.push(
          {
            $lookup: {
              from: 'schools',
              as: 'nearbySchools',
              let: { coordinates: '$location.coordinates' },
              pipeline: [
                {
                  $geoNear: {
                    near: {
                      type: 'Point',
                      coordinates: '$$coordinates',
                    },
                    distanceField: 'distance',
                    minDistance: WALKING_DISTANCE + 0.1,
                    maxDistance: NEAR_BY_DISTANCE,
                    spherical: true,
                  },
                },
              ],
            },
          },
          {
            $lookup: {
              from: 'schools',
              as: 'walkingDistanceSchools',
              let: { coordinates: '$location.coordinates' },
              pipeline: [
                {
                  $geoNear: {
                    near: {
                      type: 'Point',
                      coordinates: '$$coordinates',
                    },
                    distanceField: 'distance',
                    maxDistance: WALKING_DISTANCE,
                    spherical: true,
                  },
                },
              ],
            },
          },
          {
            $match: {
              nearbySchools: { $ne: [] },
            },
          }
        );
      }
      if (userQueryJson.walkingDistance.includes(NearBy.parks)) {
        lookupQueries.push(
          {
            $lookup: {
              from: 'parks',
              as: 'nearbyParks',
              let: { coordinates: '$location.coordinates' },
              pipeline: [
                {
                  $geoNear: {
                    near: {
                      type: 'Point',
                      coordinates: '$$coordinates',
                    },
                    distanceField: 'distance',
                    minDistance: WALKING_DISTANCE + 0.1,
                    maxDistance: NEAR_BY_DISTANCE,
                    spherical: true,
                  },
                },
              ],
            },
          },
          {
            $lookup: {
              from: 'parks',
              as: 'walkingDistanceParks',
              let: { coordinates: '$location.coordinates' },
              pipeline: [
                {
                  $geoNear: {
                    near: {
                      type: 'Point',
                      coordinates: '$$coordinates',
                    },
                    distanceField: 'distance',
                    maxDistance: WALKING_DISTANCE,
                    spherical: true,
                  },
                },
              ],
            },
          },
          {
            $match: {
              nearbyParks: { $ne: [] },
            },
          }
        );
      }
      if (userQueryJson.walkingDistance.includes(NearBy.healthcare)) {
        lookupQueries.push(
          {
            $lookup: {
              from: 'healthcare',
              as: 'nearbyHealthcares',
              let: { coordinates: '$location.coordinates' },
              pipeline: [
                {
                  $geoNear: {
                    near: {
                      type: 'Point',
                      coordinates: '$$coordinates',
                    },
                    distanceField: 'distance',
                    minDistance: WALKING_DISTANCE + 0.1,
                    maxDistance: NEAR_BY_DISTANCE,
                    spherical: true,
                  },
                },
              ],
            },
          },
          {
            $lookup: {
              from: 'healthcare',
              as: 'walkingDistanceHealthcares',
              let: { coordinates: '$location.coordinates' },
              pipeline: [
                {
                  $geoNear: {
                    near: {
                      type: 'Point',
                      coordinates: '$$coordinates',
                    },
                    distanceField: 'distance',
                    maxDistance: WALKING_DISTANCE,
                    spherical: true,
                  },
                },
              ],
            },
          },
          {
            $match: {
              nearbyHealthcares: { $ne: [] },
            },
          }
        );
      }
    }

    const query = [
      cityQuery,
      {
        $match: matchQuery,
      },
      ...lookupQueries,
    ];

    console.log('query ===>', JSON.stringify(query));

    const results = await listingsCol
      .aggregate([
        ...query,
        {
          $facet: {
            count: [{ $count: 'total' }],
            rows: [{ $skip: 0 }, { $limit: SERACH_LIMIT }],
          },
        },
      ])
      .toArray();

    const data: WithoutId<ISearchResult> = {
      userQueryString: userQuery as string,
      userQueryJson,
      queryJSON: query,
      orgId: (agentProfile?.orgId || contact?.orgId) as ObjectId,
      username: user.username,
      agentProfileId: agentProfile?._id,
      contactId: contact?._id,
      searchName: undefined,
      savedForAgent: false,
      watched: false,
      rejects: [],
      shortlists: [],
      newListings: [],
      timestamp: getNow(),
      gptValid: true,
    };

    const newResult = await searchResultsCol.insertOne(data);

    return res.json({
      properties: results[0].rows,
      searchResult: { ...data, _id: newResult.insertedId, agentProfile: req.agentProfile, constact: req.contact },
      total: results[0].count[0]?.total || 0,
    });
  } catch (error) {
    console.log('searchListings error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const saveSearch = async (req: Request, res: Response) => {
  try {
    const searchResult = req.searchResult as ISearchResult;
    const { searchName, contactId } = req.body;

    const data: Partial<ISearchResult> = {
      searchName,
      savedForAgent: true,
    };

    if (contactId) {
      const contact = await contactsCol.findOne({ _id: new ObjectId(contactId) });
      if (!contact) {
        return res.status(404).json({ msg: 'No contact' });
      }

      data.contactId = contact._id;
      data.savedForAgent = false;
    }

    await searchResultsCol.updateOne({ _id: searchResult._id }, { $set: data });

    return res.json({ msg: 'Saved' });
  } catch (error) {
    console.log('saveSearch error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const shareSearch = async (req: Request, res: Response) => {
  try {
    const agentProfile = req.agentProfile as IAgentProfile;
    const { searchId } = req.params;
    const { contactId } = req.body;

    const searchResult = await searchResultsCol.findOne({
      _id: new ObjectId(searchId),
      orgId: agentProfile.orgId,
      agentProfileId: agentProfile._id,
    });

    if (!searchResult) {
      return res.status(404).json({ msg: 'No search result' });
    }

    const contact = await contactsCol.findOne({ _id: new ObjectId(contactId) });
    if (!contact) {
      return res.status(404).json({ msg: 'No contact' });
    }

    await searchResultsCol.updateOne(
      { _id: searchResult._id },
      { $set: { contactId: contact._id, savedForAgent: false } }
    );

    return res.json({ ...searchResult, contactId: contact._id, contact });
  } catch (error) {
    console.log('shareSearch error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

// get my search results for an agent or a contact
export const getMySearchResults = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const agentProfile = req.agentProfile;
    const contact = req.contact;

    const filter: any = {
      orgId: agentProfile?.orgId || contact?.orgId,
      searchName: { $ne: undefined },
    };
    if (agentProfile) {
      filter.agentProfileId = agentProfile._id;
      filter.username = user.username;
      // filter.contactId = undefined;
    }
    if (contact) {
      filter.contactId = contact._id;
    }

    const searchResults = await searchResultsCol
      .aggregate([
        { $match: filter },
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
            path: '$contact',
            preserveNullAndEmptyArrays: true,
          },
        },
      ])
      .toArray();

    return res.json(searchResults);
  } catch (error) {
    console.log('getSearchResults error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

// get contact search result as an agent
export const getContactSearchResults = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const agentProfile = req.agentProfile as IAgentProfile;
    const { contactId } = req.params;

    const filter: any = {
      username: user.username,
      agentProfileId: agentProfile._id,
      orgId: agentProfile.orgId,
      searchName: { $ne: undefined },
      contactId: new ObjectId(contactId),
    };

    const searchResults = await searchResultsCol
      .aggregate([
        { $match: filter },
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
            path: '$contact',
            preserveNullAndEmptyArrays: true,
          },
        },
      ])
      .toArray();

    return res.json(searchResults);
  } catch (error) {
    console.log('getSearchResults error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getSearchProperties = async (req: Request, res: Response) => {
  try {
    const { page = '0' } = req.query;

    const searchResult = req.searchResult as ISearchResult;

    const results = await listingsCol
      .aggregate([
        ...searchResult.queryJSON,
        {
          $facet: {
            count: [{ $count: 'total' }],
            rows: [{ $skip: Number(page) * SERACH_LIMIT }, { $limit: SERACH_LIMIT }],
          },
        },
      ])
      .toArray();
    const rejects = await listingsCol.find({ _id: { $in: searchResult.rejects } }).toArray();
    const shortlists = await listingsCol.find({ _id: { $in: searchResult.shortlists } }).toArray();

    return res.json({
      properties: results[0].rows,
      searchResult,
      rejects,
      shortlists,
      total: results[0].count[0]?.total || 0,
    });
  } catch (error) {
    console.log('getSearchProperties error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getProperty = async (req: Request, res: Response) => {
  try {
    const searchResult = req.searchResult as ISearchResult;
    const { propertyId } = req.params;

    const properties = await listingsCol
      .aggregate([
        { $match: { _id: new ObjectId(propertyId) } },
        {
          $lookup: {
            from: 'parks',
            as: 'walkingDistanceParks',
            let: { coordinates: '$location.coordinates' },
            pipeline: [
              {
                $geoNear: {
                  near: {
                    type: 'Point',
                    coordinates: '$$coordinates',
                  },
                  distanceField: 'distance',
                  maxDistance: WALKING_DISTANCE,
                  spherical: true,
                },
              },
            ],
          },
        },
        {
          $lookup: {
            from: 'parks',
            as: 'nearbyParks',
            let: { coordinates: '$location.coordinates' },
            pipeline: [
              {
                $geoNear: {
                  near: {
                    type: 'Point',
                    coordinates: '$$coordinates',
                  },
                  distanceField: 'distance',
                  minDistance: WALKING_DISTANCE + 0.1,
                  maxDistance: NEAR_BY_DISTANCE,
                  spherical: true,
                },
              },
            ],
          },
        },
        {
          $lookup: {
            from: 'schools',
            as: 'walkingDistanceSchools',
            let: { coordinates: '$location.coordinates' },
            pipeline: [
              {
                $geoNear: {
                  near: {
                    type: 'Point',
                    coordinates: '$$coordinates',
                  },
                  distanceField: 'distance',
                  maxDistance: WALKING_DISTANCE,
                  spherical: true,
                },
              },
            ],
          },
        },
        {
          $lookup: {
            from: 'schools',
            as: 'nearbySchools',
            let: { coordinates: '$location.coordinates' },
            pipeline: [
              {
                $geoNear: {
                  near: {
                    type: 'Point',
                    coordinates: '$$coordinates',
                  },
                  distanceField: 'distance',
                  minDistance: WALKING_DISTANCE + 0.1,
                  maxDistance: NEAR_BY_DISTANCE,
                  spherical: true,
                },
              },
            ],
          },
        },
        {
          $lookup: {
            from: 'healthcare',
            as: 'walkingDistanceHealthcares',
            let: { coordinates: '$location.coordinates' },
            pipeline: [
              {
                $geoNear: {
                  near: {
                    type: 'Point',
                    coordinates: '$$coordinates',
                  },
                  distanceField: 'distance',
                  maxDistance: WALKING_DISTANCE,
                  spherical: true,
                },
              },
            ],
          },
        },
        {
          $lookup: {
            from: 'healthcare',
            as: 'nearbyHealthcares',
            let: { coordinates: '$location.coordinates' },
            pipeline: [
              {
                $geoNear: {
                  near: {
                    type: 'Point',
                    coordinates: '$$coordinates',
                  },
                  distanceField: 'distance',
                  minDistance: WALKING_DISTANCE + 0.1,
                  maxDistance: NEAR_BY_DISTANCE,
                  spherical: true,
                },
              },
            ],
          },
        },
      ])
      .toArray();
    if (properties.length === 0) {
      return res.status(404).json({ msg: 'No property found' });
    }

    return res.json({ property: properties[0], searchResult });
  } catch (error) {
    console.log('getProperty error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const shortlistProperty = async (req: Request, res: Response) => {
  try {
    const searchResult = req.searchResult as ISearchResult;
    const { propertyId } = req.params;

    const property = await listingsCol.findOne({ _id: new ObjectId(propertyId) });
    if (!property) {
      return res.status(404).json({ msg: 'No property found' });
    }

    const rejects: ObjectId[] = searchResult.rejects.filter((id) => id.toString() !== propertyId);
    const shortlists: ObjectId[] = [
      ...searchResult.shortlists.filter((id) => id.toString() !== propertyId),
      property._id,
    ];
    await searchResultsCol.updateOne(
      { _id: searchResult._id },
      {
        $set: {
          rejects,
          shortlists,
        },
      }
    );

    return res.json({ property, searchResult: { ...searchResult, rejects, shortlists } });
  } catch (error) {
    console.log('shortlistProperty error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const rejectProperty = async (req: Request, res: Response) => {
  try {
    const searchResult = req.searchResult as ISearchResult;
    const { propertyId } = req.params;

    const property = await listingsCol.findOne({ _id: new ObjectId(propertyId) });
    if (!property) {
      return res.status(404).json({ msg: 'No property found' });
    }

    const rejects: ObjectId[] = [...searchResult.rejects.filter((id) => id.toString() !== propertyId), property._id];
    const shortlists: ObjectId[] = searchResult.shortlists.filter((id) => id.toString() !== propertyId);
    await searchResultsCol.updateOne(
      { _id: searchResult._id },
      {
        $set: {
          rejects,
          shortlists,
        },
      }
    );

    return res.json({ property, searchResult: { ...searchResult, rejects, shortlists } });
  } catch (error) {
    console.log('rejectProperty error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const undoProperty = async (req: Request, res: Response) => {
  try {
    const searchResult = req.searchResult as ISearchResult;
    const { propertyId } = req.params;

    const property = await listingsCol.findOne({ _id: new ObjectId(propertyId) });
    if (!property) {
      return res.status(404).json({ msg: 'No property found' });
    }

    const rejects: ObjectId[] = searchResult.rejects.filter((id) => id.toString() !== propertyId);
    const shortlists: ObjectId[] = searchResult.shortlists.filter((id) => id.toString() !== propertyId);
    await searchResultsCol.updateOne(
      { _id: searchResult._id },
      {
        $set: {
          rejects,
          shortlists,
        },
      }
    );

    return res.json({ property, searchResult: { ...searchResult, rejects, shortlists } });
  } catch (error) {
    console.log('rejectProperty error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const shareProperty = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const agentProfile = req.agentProfile as IAgentProfile;
    const searchResult = req.searchResult as ISearchResult;
    const { propertyId } = req.params;
    const { contactId, message } = req.body;

    const property = await listingsCol.findOne({ _id: new ObjectId(propertyId) });
    if (!property) {
      return res.status(404).json({ msg: 'No property found' });
    }
    const contact = await contactsCol.findOne({ _id: new ObjectId(contactId) });
    if (!contact) {
      return res.status(404).json({ msg: 'No contact found' });
    }
    if (!contact.email) {
      return res.status(400).json({ msg: 'No email bad request' });
    }

    // share search results
    await searchResultsCol.updateOne(
      { _id: searchResult._id },
      {
        $set: {
          contactId: contact._id,
        },
      }
    );

    // get dm & update dm
    const dm = await roomsCol.findOne({
      orgId: agentProfile.orgId,
      usernames: {
        $all: [user.username, contact.username || contact._id.toString()],
      },
      type: RoomType.dm,
      deleted: false,
    });
    if (!dm) {
      return res.status(404).json({ msg: 'No room found' });
    }

    // create message
    const msgData: WithoutId<IMessage> = {
      orgId: agentProfile.orgId,
      roomId: dm._id,
      msg: `Hi ${contact.name} Please check this listing located in ${property.City}, ${property.StateOrProvince}`,
      senderName: user.username,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      attatchMents: [],
      edited: false,
      editable: false,
      sharelink: `search-results/${searchResult._id}/properties/${property._id}`,
      mentions: [],
      channels: [],
    };
    const newMsg = await messagesCol.insertOne(msgData);

    // get all users
    const users = await usersCol.find({ username: { $in: dm.usernames } }).toArray();

    // update room
    const roomData: IRoom = {
      ...dm,
      userStatus: {
        ...dm.userStatus,
        ...dm.usernames.reduce(
          (obj, un) => ({
            ...obj,
            [un]: {
              online: !!users.find((u) => u.username === un)?.socketId,
              notis: un !== user.username ? dm.userStatus[un].notis + 1 : dm.userStatus[un].notis,
              unRead: true,
              firstNotiMessage:
                un !== user.username
                  ? dm.userStatus[un].firstNotiMessage || newMsg.insertedId
                  : dm.userStatus[un].firstNotiMessage,
              firstUnReadmessage: dm.userStatus[un].firstUnReadmessage || newMsg.insertedId,
              socketId: users.find((u) => u.username === un)?.socketId,
            },
          }),
          {}
        ),
      },
    };

    if (dm.type === RoomType.dm && !dm.dmInitiated) {
      roomData.dmInitiated = true;
    }

    await roomsCol.updateOne({ _id: dm._id }, { $set: roomData });

    users.forEach((u) => {
      if (io && u.socketId) {
        // update room
        io.to(u.socketId).emit(ServerMessageType.channelUpdate, roomData);

        // send message
        io.to(u.socketId).emit(ServerMessageType.msgSend, { ...msgData, _id: newMsg.insertedId });
      }
    });

    // send email
    if (contact.username) {
      await sendEmail(
        contact.email,
        'New listing shared',
        undefined,
        template(sharePropertyTemplate)({
          data: {
            name: contact.name,
            orgName: agentProfile.org?.name,
            link: `${process.env.WEB_URL}/app/contact-orgs/${contact._id}/rooms/${dm._id}`,
          },
        })
      );
    } else {
      let inviteCode = contact.inviteCode;
      if (!contact.inviteCode) {
        inviteCode = getRandomString(10);
        await contactsCol.updateOne({ _id: contact._id }, { $set: { inviteCode } });
      }

      await sendEmail(
        contact.email,
        'New listing shared',
        undefined,
        template(sharePropertyTemplate)({
          data: {
            name: contact.name,
            orgName: agentProfile.org?.name,
            link: `${process.env.WEB_URL}/invitations/${agentProfile.orgId}/contacts/${contactId}?inviteCode=${inviteCode}&orgName=${agentProfile.org?.name}&_next=/app/contact-orgs/${contact._id}/rooms/${dm._id}`,
          },
        })
      );
    }

    return res.json({ msg: 'Email sent' });
  } catch (error) {
    console.log('rejectProperty error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const deleteSearchResult = async (req: Request, res: Response) => {
  try {
    const searchResult = req.searchResult as ISearchResult;

    await searchResultsCol.updateOne(
      { _id: searchResult._id },
      { $set: { searchName: undefined, savedForAgent: false } }
    );

    return res.json({ msg: 'success' });
  } catch (error) {
    console.log('deleteSearchResult error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
