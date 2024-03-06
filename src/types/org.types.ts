import { ObjectId } from 'mongodb';
import { IIndustry } from './industry.types';

export enum MLSSource {
  crea = 'crea',
  kvcore = 'kvcore',
}
export interface IMLSFeed {
  source: MLSSource;
  api_key: string;
  api_secret: string;
}

export interface DefaultOrgTheme {
  title: string;
  primary: string;
  secondary: string;
  background: string;
  fontFamily: string;
  description: string;
}

export interface IOrgBrand {
  logos: string[];
  colors: string[];
  titleFont: string;
  bodyFont: string;
}

export interface IOrg {
  _id: ObjectId;
  name: string;
  owner: string; // username
  logoUrl?: string;
  mlsFeeds?: IMLSFeed[];
  industryId: ObjectId;
  industry?: IIndustry;
  deleted: boolean;
  deletedAt?: number;
  createdAt: number;
  brand?: IOrgBrand;
  whiteLabel?: DefaultOrgTheme;
}
