import { ObjectId } from 'mongodb';
import { ITemplateLayout, TemplateType } from './template.types';

export interface IBrochure {
  _id: ObjectId;
  orgId: ObjectId;
  propertyId: ObjectId;
  property: any;
  creator: string;
  data: any;
  layoutId: ObjectId;
  layout: ITemplateLayout;
  type: TemplateType;
  createdAt: number;
}
