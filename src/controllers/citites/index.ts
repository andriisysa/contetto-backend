import type { Request, Response } from 'express';
import { WithoutId } from 'mongodb';

import { db } from '@/database';

import { ICity } from '@/types/city.types';

const citiesCol = db.collection<WithoutId<ICity>>('cities');

export const getAllCities = async (req: Request, res: Response) => {
  try {
    const cities = await citiesCol.find().toArray();
    console.log(cities.length);
    return res.json(cities);
  } catch (error) {
    console.log('getCities error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const searchCitites = async (req: Request, res: Response) => {
  try {
    const search = req.query.search;
    if (!search || String(search).length < 2) return [];

    const cities = await citiesCol
      .find({
        city: {
          $regex: String(search).replace(/[-[\]{}()*+?.,\\/^$|#\s]/g, '\\$&'),
          $options: 'i',
        },
      })
      .limit(20)
      .toArray();

    return res.json(cities);
  } catch (error) {
    console.log('getCities error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
