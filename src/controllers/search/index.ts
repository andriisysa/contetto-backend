import dotenv from 'dotenv';
import type { Request, Response } from 'express';
import axios from 'axios';
import { db } from '@/database';
import { ObjectId, WithoutId } from 'mongodb';
import { ISearchResult } from '@/types/search.types';
import { IAgentProfile } from '@/types/agentProfile.types';
import { getNow } from '@/utils';
import { IContact } from '@/types/contact.types';
import { IUser } from '@/types/user.types';
import { ICity } from '@/types/city.types';

dotenv.config();

const listingsCol = db.collection('mlsListings');
const searchResultsCol = db.collection<WithoutId<ISearchResult>>('searchResults');
const contactsCol = db.collection<WithoutId<IContact>>('contacts');
const citiesCol = db.collection<WithoutId<ICity>>('cities');

const SERACH_LIMIT = 12;
const MAX_RANGE = 100;
const NEAR_BY_DISTANCE = 5 * 1000;
const WALKING_DISTANCE = 400;

const processValue = (apiResponseData: any, userQuery: any) => {
  let value = apiResponseData.choices && apiResponseData.choices[0].message.content;
  value = value.trim();

  try {
    value = JSON.parse(value);
  } catch (e) {
    value = JSON.parse(value.replace(/"/g, "'"));
  }

  if (Array.isArray(value)) {
    value = value.reduce((sum, cur) => ({ ...sum, ...cur }), {});
  }

  return value;
};

export const searchListings = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const agentProfile = req.agentProfile;
    const contact = req.contact;

    const { search: userQuery, cityId, range } = req.query;

    if (!cityId || !Number(range)) {
      return res.status(400).json({ msg: 'Bad request, No city selected' });
    }

    let query: any = {};

    if (userQuery) {
      const searchResult = await searchResultsCol.findOne({
        orgId: agentProfile?.orgId || contact?.orgId,
        userQueryString: userQuery,
        gptValid: true,
      });

      if (searchResult) {
        query = searchResult.queryJSON;
      } else {
        const chatGPTInput = {
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `
                  You are tasked with translating natural language search queries into Nodejs MongoDB JSON Object format. Just using simple query not mongodb aggregate.
                  This task pertains to a real estate search involving a MongoDB collection with the following attributes:
                  'ArchitecturalStyle': 'Bi-level', - string type,  Homebuyers may look for a specific architectural style that suits their taste or family needs.
                  'AttachedGarageYN': true, - boolean type,  Homebuyers often prefer attached garages for direct access to the home and for security reasons.
                  'BathroomsHalf': 1, -  Number of half bathrooms can be a consideration for buyers who entertain guests or have a large family.
                  'BathroomsTotal': 5, -  Total number of bathrooms is a primary search criteria for most buyers.
                  'BedroomsTotal': 6, -  The number of bedrooms is important for the size of the family and the potential for home offices, guest rooms, etc.
                  'BuildingAreaTotal': 1991.4, -  number type, The total square footage of the living area can be a deciding factor based on family size and space requirements.
                  'BuildingAreaUnits': 'square feet', -  string type, The unit of area measurement is relevant to the buyer's understanding based on regional preference.
                  'City': 'High River', -  string type, City location is crucial for proximity to employment, schools, and amenities.
                  'ConstructionMaterials': 'Wood frame', - string type, Buyers interested in construction details may look for specific building materials.
                  'Cooling': 'Central air conditioning', - string type, Cooling systems are essential in certain climates and for personal comfort.
                  'CoolingYN': true, - boolean type, indicate Cooling systems exist or not 
                  'Country': 'Canada', -  The country can be used to narrow down searches geographically at a high level.
                  'CoveredSpaces': 2, -  The number of covered parking spaces can be a deciding factor for buyers with multiple vehicles or those who need protected storage space.
                  'Fencing': 'Fence', -  Fencing is important for buyers with pets, children, or privacy concerns.
                  'FireplacesTotal': 2, - number type, Fireplaces can be a desirable feature for aesthetic or heating purposes.
                  'Flooring': 'Carpeted,Laminate', - string type, Flooring types can influence a buyer's decision based on allergies, maintenance, or personal preference.
                  'GarageSpaces': 2, -  The number of garage spaces is often specified in buyer searches.
                  'Heating': 'Forced air,', -  Heating type can affect a buyer's decision based on comfort, efficiency, and fuel type.
                  'HeatingFuel': 'Natural gas', - string type, The type of heating fuel is important for cost considerations and personal preference.
                  'ListingId': 'A1107611', -  The listing ID is used to reference the specific property listing.
                  'ListPrice': 599995.00, - number type, List price is one of the most significant factors in a property search.
                  'LotSizeArea': 563.6, - number type, The lot size area can determine the amount of outdoor space and is important for gardening, entertainment, and expansion possibilities.
                  'LotSizeUnits': 'square meters', - string type, Units of lot size measurement can vary by region and buyer preference.
                  'PhotosCount': 50, -  The number of photos available can be important for remote buyers or those who wish to preview the property online before visiting.
                  'PostalCode': 'T1V0E2', - string type, The postal code is often used to search within a specific area.
                  'OwnershipType': 'Condominium', - string type, OwnershipType is used to filter searches to the kind of property a buyer is interested in (e.g., "strata", "house", "condo"),
                          OwnershipType is important for property filter. if search string contains "strata" or "condo" find where OwnershipType IN ['Strata','Condominium','Condominium/Strata', 'Leasehold Condo/Strata','Leasehold Condo/Strata']
                          if search string  contains "house" find where OwnershipType: "Freehold"
                  'PublicRemarks': 'Description', - string type, Detailed description of the property provides insight into features not captured by other data fields.
                  'StateOrProvince': 'Alberta', - string type, State or province information is used for regional searches within a country.
                  'StreetName': 'High Country', - string type, Street name is part of the address used to identify the property's location.
                  'StreetNumber': '2025', - string type, Street number is the specific identifier for the property's location on its street.
                  'UnparsedAddress': '2025 High Country Rise NW', - string type, Full address in one line, often used for easy reference or input into mapping software.
                  'YearBuilt': 2015, - number type, The year the property was built is important for buyers looking for newer homes with modern amenities.
                  'Zoning': '' - string type, Zoning information can influence a buyer's decision based on intended use or future development potential.
                  
                  These are the possible values of OwnershipType:
                  'Strata','Condominium','Leasehold','Other, See Remarks','Cooperative','Timeshare/Fractional','Shares in Co-operative','Life Lease','Leasehold Condo/Strata','Leasehold Condo/Strata','Freehold','Condominium/Strata','Undivided Co-ownership','Unknown'
                  
                  These are the possible values of Cooling:
                  null, 'Heat Pump,Air exchanger', 'Air Conditioned,Heat Pump', 'Wall unit,Window air conditioner', 'Partially air conditioned', 'Window air conditioner', 'Fully air conditioned', 'Central air conditioning', 'Central air conditioning,Fully air conditioned', 'Air exchanger', 'Central air conditioning,Heat Pump', 'Wall unit,Air exchanger', 'Air Conditioned,Fully air conditioned', 'Ductless', 'Ductless,Wall unit', 'See Remarks', 'Wall unit', 'None', 'Central air conditioning,Ductless', 'Heat Pump', 'Wall unit,Heat Pump', 'Central air conditioning,Air exchanger', 'Air exchanger,Central air conditioning', 'Air Conditioned'
                  
                  These are the possible values of BuildingAreaUnits:
                  null, 'square meters', 'acres', 'square feet'
                  
                  These are the possible values of Fencing:
                  null, 'Not fenced', 'Fenced yard,Other', 'Cross fenced,Fence', 'Fenced yard', 'Fence,Partially fenced', 'Cross fenced', 'Cross fenced,Fence,Partially fenced', 'Partially fenced', 'Fence'
                  
                  These are the possile values of LotSizeUnits:
                  null, 'square meters', 'acres', 'hectares', 'square feet'
                  
                  These are the possible values of Zoning:
                  null, 'Multi-Family', 'Rural residential', 'Country residential', 'Industrial Strata', 'Residential/Commercial', 'Recreational', 'Residential medium density', 'Condominium Strata', 'Residential low density', 'Single family dwelling', 'Multiple unit dwelling', 'Commercial', 'Duplex', 'Residential', 'Convenience commercial', 'Single detached residential', 'Agricultural', 'Mobile home', 'Highway commercial', 'Other', 'Unknown'

                  Make sure the response does not contain PropertyType, it should be OwnershipType
                  
                  Make sure the response does not contain the variable definition or trailing semicolon. I will be using json_decode to turn your response into the Json Object to pass to mongo find.
                  Your task is to convert the following natural language query into a Javascrit MongoDB query JSON Object Format.
                  
                  Make sure it the format can be parsed into a Json Object by Node.js JSON.parse function
                `,
            },
            { role: 'user', content: userQuery },
          ],
        };

        // 'PropertyType': 'Single Family', - string type, Property type is used to filter searches to the kind of property a buyer is interested in (e.g., single-family homes, condos).
        // These are the possible values of PropertyType:
        // 'Single Family','Business','Agriculture','Industrial','Other','Office','Institutional - Special Purpose','Hospitality','Vacant Land','Retail','Multi-family','Parking','Recreational'

        const apiEndpoint = 'https://api.openai.com/v1/chat/completions';

        const apiResponse = await axios.post(apiEndpoint, chatGPTInput, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.CHATGPT_KEY}`,
          },
        });

        query = processValue(apiResponse.data, userQuery);
      }
    }

    if (query.location) delete query.location;

    query = {
      ...query,
      $and: [{ ListPrice: { $ne: 0 } }, { ListPrice: { $ne: null } }],
      deleted: false,
    };

    const city = await citiesCol.findOne({ _id: new ObjectId(String(cityId)) });
    if (!city) {
      return res.status(400).json({ msg: 'Bad request, No city found' });
    } else {
      query.location = {
        $nearSphere: {
          $geometry: { type: 'Point', coordinates: [city.lng, city.lat] },
          $maxDistance: (Number(range) > MAX_RANGE ? MAX_RANGE : Number(range)) * 1000,
        },
      };
    }

    console.log('query ===>', query);
    const results = await listingsCol.find(query).limit(SERACH_LIMIT).toArray();
    const total = await listingsCol.find(query).count();

    const data: WithoutId<ISearchResult> = {
      userQueryString: userQuery as string,
      userQueryJson: {
        cityId: city._id,
        city: city,
        range,
      },
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
      properties: results,
      searchResult: { ...data, _id: newResult.insertedId, agentProfile: req.agentProfile, constact: req.contact },
      total,
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
      .find(searchResult.queryJSON)
      .skip(Number(page) * SERACH_LIMIT)
      .limit(SERACH_LIMIT)
      .toArray();
    const rejects = await listingsCol.find({ _id: { $in: searchResult.rejects } }).toArray();
    const shortlists = await listingsCol.find({ _id: { $in: searchResult.shortlists } }).toArray();
    const total = await listingsCol.find(searchResult.queryJSON).count();
    console.log('total ===>', total);

    return res.json({ properties: results, searchResult, rejects, shortlists, total });
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
