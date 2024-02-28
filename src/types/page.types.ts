import { ObjectId } from 'mongodb';

export interface IPage {
  _id: ObjectId;
  orgId: ObjectId;
  creator: string;
  title: string; // unique field
  slug: string; // unique field
  html: string;
  css: string;
  isPublished: boolean;
  timestamp: number;
}
