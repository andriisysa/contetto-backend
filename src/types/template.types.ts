import { ObjectId } from 'mongodb';
import { IIndustry } from './industry.types';

export interface ITemplateLayout {
  _id: ObjectId;
  name: string;
  width: number;
  height: number;
}

export enum TemplateType {
  brochure = 'brochure',
  social = 'social',
  ads = 'ads',
}
export interface ITemplate {
  _id: ObjectId;
  name: string;
  layoutId: ObjectId;
  layout?: ITemplateLayout;
  industryIds: ObjectId[];
  industries?: IIndustry[];
  orgIds: ObjectId[];
  isPublic: boolean;
  price: number; // 0 for free, price unit usd
  type: TemplateType;
  data: any;
  createdAt: number;
  updatedAt: number;
}

export interface ITemplateImage {
  _id: ObjectId;
  name: string;
  username: string;
  url: string;
  s3Key: string;
  mimetype: string;
  ext: string;
  orgId?: ObjectId;
}
