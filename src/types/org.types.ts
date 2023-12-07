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

export interface DefaultAvaOrgTheme {
  title: string
  primary: string
  secondary: string
  background: string
  fontFamily: string
  description: string
}

export interface IOrg {
  _id: ObjectId;
  name: string;
  owner: string; // username
  logoUrl?: string;
  mlsFeeds?: IMLSFeed[];
  deleted: boolean;
  deletedAt?: number;
  whiteLabel?: DefaultAvaOrgTheme
}
