import { ObjectId } from 'mongodb';

export interface IPost {
  _id: ObjectId;
  orgId: ObjectId;
  creator: string;
  timestamp: number;
  title: string; // unique field
  slug: string; // unique field, slugfied title: ex: if title = "my first post", slug should be my-first-post
  data: string; // <html><div style="color: red; "></div></html>
  dataObject: any; // {title: string, sections: [{name: 'hero}] }
}
