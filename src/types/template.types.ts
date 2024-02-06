import { ObjectId } from 'mongodb';

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
  orgIds: ObjectId[];
  isPublic: boolean;
  price: number; // 0 for free, price unit usd
  type: TemplateType;
  data: any;
  layoutId: ObjectId;
  layout?: ITemplateLayout;
  createdAt: number;
  updatedAt: number;
}

export interface ITemplateImage {
  _id: ObjectId;
  name: string;
  username: string;
  url: string;
  s3Key: string;
  mimeType: string;
  ext: string;
  orgId?: ObjectId;
}
