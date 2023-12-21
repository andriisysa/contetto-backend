import type { Request, Response } from 'express';
import { WithoutId } from 'mongodb';

import { db } from '@/database';

import { ICity } from '@/types/city.types';

const citiesCol = db.collection<WithoutId<ICity>>('cities');

export const searchCitites = async (req: Request, res: Response) => {
  try {
    const search = req.query.search;
    if (!search || String(search).length < 2) return res.json([]);

    const arr = String(search).split(',');

    const query: any = {
      city: {
        $regex: arr[0].trim().replace(/[-[\]{}()*+?.,\\/^$|#\s]/g, '\\$&'),
        $options: 'i',
      },
    };

    if (arr[1] && arr[1].trim()) {
      query.admin_name = {
        $regex: arr[1].trim().replace(/[-[\]{}()*+?.,\\/^$|#\s]/g, '\\$&'),
        $options: 'i',
      };
    }

    console.log(query);

    const cities = await citiesCol.find(query).limit(20).toArray();

    return res.json(cities);
  } catch (error) {
    console.log('getCities error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const nearestCities = async (req: Request, res: Response) => {
  try {
    const { lat, lng } = req.query;

    if (!Number(lat) || !Number(lng)) return res.json([]);

    const cities = await citiesCol
      .aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
            distanceField: 'distance',
            spherical: true,
          },
        },
        { $limit: 10 },
      ])
      .toArray();

    return res.json(cities);
  } catch (error) {
    console.log('getCities error ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
