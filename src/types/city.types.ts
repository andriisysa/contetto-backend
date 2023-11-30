import { ObjectId } from 'mongodb';

export interface ICity {
  _id: ObjectId;
  city: string;
  city_ascii: string;
  lat: number;
  lng: number;
  country: string;
  iso2: string;
  iso3: string;
  admin_name: string;
  admin_name_ascii: string;
  admin_code: string;
  density: number;
  population: string;
  ranking: number;
  timezone: string;
  same_name: 'FALSE' | 'TRUE';
}
