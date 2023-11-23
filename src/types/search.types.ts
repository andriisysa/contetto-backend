import { ObjectId } from 'mongodb';
import { IOrg } from './org.types';
import { IAgentProfile } from './agentProfile.types';
import { IContact } from './contact.types';

export interface ISearchResult {
  _id: ObjectId;
  queryString: string; /// the string they typed
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
}
