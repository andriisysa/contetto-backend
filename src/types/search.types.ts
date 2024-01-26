import { ObjectId } from 'mongodb';
import { IOrg } from './org.types';
import { IAgentProfile } from './agentProfile.types';
import { IContact } from './contact.types';
import { ICity } from './city.types';

export enum NearBy {
  schools = 'School',
  parks = 'Park',
  healthcare = 'Medical Facility',
}

export type Operator = ">" | "<" | "="

export interface IUserQueryJson {
  cityId: ObjectId;
  range: string;
  city?: ICity;
  keywords?: string[];
  mls?: string;
  listedSince?: number;

  price?: number[];
  sqft?: number[];
  lotAcres?: number[];
  minYearBuilt?: number;
  maxYearBuilt?: number;

  rooms?: number;
  roomsOperator?: Operator;
  bathrooms?: number;
  bathroomsOperator?: Operator;
  storeys?: number;
  storeysOperator?: Operator;
  firePlaces?: number;
  firePlacesOperator?: Operator;
  parkingSpaces?: number;
  parkingSpacesOperator?: Operator;

  propertyType?: ('Condo' | 'House' | 'Other')[];
  walkingDistance?: NearBy[];
  address?: string
}

export interface ISearchResult {
  _id: ObjectId;
  userQueryString: string; /// the string they typed
  userQueryJson: IUserQueryJson; /// options what user choose
  queryJSON: any; /// GPT interpreted version
  orgId: ObjectId; // orgId
  org?: IOrg;
  username: string; // username of person doing the search
  agentProfileId?: ObjectId;
  agentProfile?: IAgentProfile;
  contactId?: ObjectId; // contact this search has been saved to
  contact?: IContact;
  searchName?: string; // if user manually saves the search they can add a name to it
  savedForAgent: boolean; // if the agent saves it in their personal "my saves searches"
  watched: boolean; // whether our cron is searching this periodically in the background and alerting contact+agent to new results
  rejects: ObjectId[]; // properties that were rejected fom this search results
  shortlists: ObjectId[]; // properties that were liked from this search results
  newListings: ObjectId[]; // properties that the cron discovered we want to show the user quickly when they click a push notification/email link
  timestamp: number;
  gptValid: boolean;
}
