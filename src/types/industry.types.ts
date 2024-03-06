import { ObjectId } from 'mongodb';

export enum IndustryType {
  realEstate = 'real-estate',
  general = 'general',
}

export interface IIndustry {
  _id: ObjectId;
  name: string;
  type: IndustryType;
}
