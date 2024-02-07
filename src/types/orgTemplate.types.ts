import { ObjectId } from 'mongodb';
import { ITemplate } from './template.types';

export interface IOrgTemplate {
  _id: ObjectId;
  orgId: ObjectId;
  templateId: ObjectId;
  template?: ITemplate;
  hidden: boolean;
}
