import dotenv from 'dotenv';
import type { Request, Response } from 'express';
import axios from 'axios';
import { searchDB } from '@/database';
import { ObjectId } from 'mongodb';

dotenv.config();

const listingsCol = searchDB.collection('SampleListings');

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

  if (userQuery.includes('house') && !Object.keys(value).find((v) => v === 'PropertySubType')) {
    value.push({ PropertySubType: 'Single Family Detached' });
  }

  return value;
};

export const searchListings = async (req: Request, res: Response) => {
  try {
    const userQuery = req.query.search;

    if (!userQuery) {
      const listings = await listingsCol.find({}).limit(16).toArray();
      return res.send(listings);
    }

    const chatGPTInput = {
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content:
            'You are tasked with translating natural language search queries into NodeJS MongoDB query JSON object format. Just using simple query not mongodb aggregate. This task pertains to a real estate search involving a MongoDB collection with the following attributes:\n     \n- "VIVA_YoungestAgeAllowed": int, representing the minimum age required to live in a property (0 if no age restriction).\n- "LaundryFeatures": array of strings describing laundry facilities.\n- "Flooring": array of strings indicating the types of flooring in the house.   Acceptable values are: Vinyl, Hardwood, Tile, Carpet, Wood, Mixed, Laminate ... the closest matching value, if flooring is specified\n- "FireplacesTotal": int, representing the number of fireplaces in the property.\n- "WaterfrontFeatures": array of strings describing waterfront views.\n- "ViewYN": bool, indicating whether the property has a view.\n- "SeniorCommunityYN": bool, indicating whether the property is part of a seniors community.\n- "Cooling": array of strings indicating cooling equipment such as HVAC or Heat pump.\n- "ExteriorFeatures": array of strings describing exterior features like Garden, Balcony, and Deck.\n- "VIVA_Bath2PieceTotal": int, representing the number of 2-piece bathrooms.\n- "VIVA_Ensuite3PieceTotal": int, representing the number of 3-piece ensuites.\n- "VIVA_BathroomsCountThirdLevel": int, representing the number of bathrooms on the third level.\n- "VIVA_BedroomsCountLowerLevel": int, representing the number of bedrooms on the lower level.\n- "BuildingName": string, providing the name of the building.\n- "AssociationFeeFrequency": string, indicating the frequency of association fees (e.g., \'weekly\' or \'monthly\').\n- "VIVA_Bath4PieceTotal": int, representing the number of 4-piece bathrooms.\n- "HeatingYN": bool, indicating whether the property has heating.\n- "VIVA_ParkingStrataCommonSpaces": int, representing the number of shared parking spaces at the strata.\n- "TaxAnnualAmount": int, representing the yearly property tax amount in CAD.\n- "VIVA_BathroomsCountLowerLevel": int, representing the number of bathrooms on the lower level.\n- "CountyOrParish": string, specifying the county or parish of the unit.\n- "PropertyType": string, indicating whether the property is \'residential\' or \'commercial\' ... not to be confused with PropertySubType which distinguished between houses, condos/apartments, land etc\n- "BathroomsTotalDecimal": decimal, representing the total number of bathrooms (e.g., 2.5 for 2 full bathrooms and 1 half bath).\n- "AssociationYN": bool, indicating whether the unit is part of a strata association.\n- "VIVA_SmokingBylaw": bool, indicating the presence of smoking rules.\n- "VIVA_LivingAreaLower": int, representing the square feet of living space in the lower area.\n- "AttachedGarageYN": bool, indicating the presence of an attached garage.\n- "VIVA_LivingAreaMain": int, representing the square feet of the main floor\'s living area.\n- "Roof": array of strings describing roofing materials (e.g., asphalt or metal).\n- "ParkingTotal": int, representing the number of parking spaces associated with the unit.\n- "VIVA_LivingAreaOther": int, representing the square feet of any other living areas on the parcel.\n- "VIVA_UnfinishedAreaTotal": int, representing the square feet of unfinished area on the parcel.\n- "PropertySubType": string, specifying the property subtype (e.g., \'Single Family Detached\').\n- "WaterfrontYN": bool, indicating whether the property is waterfront.\n- "LotSizeAcres": decimal, representing the property size in acres.\n- "WaterSource": array of strings describing water sources (e.g., \'Well: Drilled\').\n- "VIVA_KitchensCountSecondLevel": int, representing the number of kitchens on the second level.\n- "YearBuilt": int, indicating the year the unit was built (e.g., 1993).\n- "ElectricOnPropertyYN": bool, indicating whether the unit has electrical service.\n- "VIVA_BedroomsCountOtherLevel": int, representing the number of bedrooms on additional levels not covered by other fields.\n- "PetsAllowed": array of strings specifying types of pets allowed (e.g., Aquariums, Birds, Cats OK, Dogs OK).\n- "OtherStructures": array of strings describing other structures on the property (e.g., \'storage shed\').\n- "LivingArea": int, representing the total square feet of living area.\n- "TaxAssessedValue": int, representing the CAD value of the yearly tax assessment.\n- "ParkingFeatures": array of strings describing parking features (e.g., Garage, Garage Double).\n- "Heating": array of strings indicating types of heating (e.g., Electric, Forced Air).\n- "VIVA_BedroomsCountSecondLevel": int, representing the number of bedrooms on the second level.\n- "BathroomsTotalInteger": int, representing the total number of bathrooms.\n- "City": string, specifying the city. Known cities: Saanich, Victoria, Lasqueti Island, Duncan, Port Renfrew, Black Creek, Galiano Island, Salt Spring, Ucluelet, Langford, Ladysmith, View Royal, Parksville, Port Alberni, Nanaimo, Esquimalt, Quadra Island, Sidney, Sooke, Comox ... if they enter another location, try searching for it in PublicRemarks, PrivateRemarks and Unparsed address too. For example a search for \'Calgary\' would be \'$or\':[\'City\':\'Calgary\',\'PublicRemarks\':[\'$regex\':\'Calgary\',$options:i],\'PublicRemarks\':[\'$regex\':\'Calgary\',$options:i],\'UnparsedAddress\':[\'$regex\':\'Calgary\',$options:i]]\n- "DirectionFaces": string, indicating the direction the unit faces (e.g., North, South, East, West).\n- "VIVA_BedAndBreakfast": bool, indicating whether the unit is a bed and breakfast.\n- "ConstructionMaterials": array of strings describing construction materials (e.g., wood).\n- "PrivateRemarks": text, providing text entered by the listing agent (useful for keyword searches).\n- "OtherEquipment": array of strings specifying other equipment on the property (e.g., central vacuum, electric garage door opener).\n- "BedroomsTotal": int, representing the total number of bedrooms.\n- "VIVA_AssociationFeeYear": int, representing the total CAD of each strata/association fee charge (charged at AssociationFeeFrequency).\n- "VIVA_Bath3PieceTotal": int, representing the number of 3-piece bathrooms.\n- "CoolingYN": bool, indicating whether the unit has a cooling system.\n- "CarportSpaces": int, representing the number of parking spaces in a carport.\n- "VIVA_BedroomsOrDensTotal": int, representing the total number of bedrooms or dens.\n- "VIVA_Ensuite2PieceTotal": int, representing the number of 2-piece ensuites.\n- "GarageYN": bool, indicating whether the parcel has a garage.\n- "VIVA_BathroomsCountSecondLevel": int, representing the number of bathrooms on the second level.\n- "Longitude": float, representing the longitude.\n- "CarportYN": bool, indicating whether there is a carport.\n- "PublicRemarks": text, providing a public description (useful for keyword searches).\n- "Basement": array of strings specifying basement details (may contain \'none\' if no basement).\n- "Latitude": float, representing the latitude.\n- "ListPrice": int, representing the price in CAD of the property.\n- "StateOrProvince": string, indicating the state or province (usually abbreviated, e.g., BC for British Columbia).\n- "VIVA_BasementHeightFeet": int, sometimes populated with the height of the basement in feet.\n- "VIVA_Bath5PieceTotal": int, representing the number of 5-piece bathrooms.\n- "FireplaceYN": bool, indicating whether there is at least 1 fireplace.\n- "VIVA_Ensuite4PieceTotal": int, representing the number of 4-piece ensuites.\n- "MainLevelBathrooms": int, representing the number of bathrooms on the main level.\n- "FoundationDetails": array of keywords about the foundation (e.g., concrete perimeter, slab).\n- "HomeWarrantyYN": bool, indicating whether the home comes with a warranty.\n- "InteriorFeatures": array of keywords describing inner features of the property (e.g., vaulted ceiling(s)).\n- "VIVA_RentalAllowed": string, describing rental permissions (e.g., \'Unrestricted\' for properties that can be rented out).\n- "Coordinates": [latitude, longitude], representing coordinates as latitude and longitude.\n- "Country": string, specifying the country (e.g., US or CA for the United States and Canada).\n- "VIVA_BasementHeightInches": int, sometimes populated with basement height in inches.\n- "VIVA_KitchensTotal": int, representing the total number of kitchens.\n- "VIVA_RoomCount": int, representing the total number of rooms.\n- "BathroomsHalf": int, representing the number of half bathrooms.\n- "VIVA_BBQsAllowedYN": bool, indicating whether barbecues are allowed.\n- "Sewer": array of keywords describing sewer systems (e.g., Holding Tank, Septic System).\n- "MainLevelBedrooms": int, representing the number of bedrooms on the main level.\n- "Utilities": array of strings providing details about utilities (e.g., Electricity Connected).\n- "VIVA_Layout": string, sometimes populated with a description of how the place is laid out.\n- "NumberOfBuildings": int, representing the number of buildings on the property.\n- "GarageSpaces": int, representing the number of parking spaces in the garage.\n- "Ownership": string, specifying ownership type (e.g., freehold or strata).\n- "LotFeatures": array of useful description keywords about the lot (e.g., acreage, no through road, private, quiet area, serviced, southern exposure, walk-on waterfront).\n- "PostalCode": string, specifying the postal code.\n- "LotSizeSquareFeet": decimal, representing lot size in square feet.\n- "ArchitecturalStyle": array of descriptive strings about the style of the property (e.g., \'west coast\').\n- "VIVA_KitchensCountMainLevel": int, representing the number of kitchens on the main level.\n- "UnparsedAddress": string, providing the address of the unit.\n- "PropertySubType": string,  Will be one of: Multi Family, Business, Office, Single Family Detached, Condo Apartment, Mixed Use, Industrial, Unimproved Land, Retail, Other, Half Duplex, Row/Townhouse, Land .. if someone is looking for a house they want "Single Family Detached" for example.. if they want a condo or apartment they want "Condo Apartment" REMEMBER TO USE THIS FIELD IS SOMEONE SPECIFIED House Land or Condo\n\nWe will filter based on relevant boolean columns, use gt/gte/lt/lte ranges on decimal, integer, and float columns, and perform string searches on other relevant columns. Exclude unrelated columns from the query.\n\nDiscard any parts of the query that are not able to be mapped to the provided collection attributes. \n\nMake sure the response does not contain the variable definition or trailing semicolon. I will be using json_decode to turn your response into the array ill pass to mongo find.\nYour task is to convert the following natural language query into a NodeJS MongoDB query array format.\n\nIf someone enters the name of a city/cities make sure to capitalize them \n\nVERY Important to specify PropertySubType if house or condo is mentioned in the query; house: "Single Family Detached", condo: "Condo Apartment"\n\nMake sure the format can be parsed into an object not an array by nodejs',
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

    console.log(apiResponse.data.choices[0].message);
    const query = processValue(apiResponse.data, userQuery);
    console.log('query ===>', query);
    const results = await listingsCol.find(query).limit(16).toArray();

    return res.json(results);
  } catch (error) {
    console.log('searchListings error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const findOne = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const listing = await listingsCol.findOne({ _id: new ObjectId(id) });

    return res.json(listing);
  } catch (error) {
    console.log('search findOne error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
