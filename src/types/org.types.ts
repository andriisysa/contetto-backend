import { ObjectId } from 'mongodb';

export enum MLSSource {
  crea = 'crea',
  kvcore = 'kvcore',
}
export interface IMLSFeed {
  source: MLSSource;
  api_key: string;
  api_secret: string;
}

export interface IOrg {
  _id: ObjectId;
  name: string;
  owner: string; // username
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string;
  mlsFeeds?: IMLSFeed[];
  deleted: boolean;
}
