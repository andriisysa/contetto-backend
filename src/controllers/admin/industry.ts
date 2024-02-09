import type { Request, Response } from 'express';
import { ObjectId, WithoutId } from 'mongodb';

import { db } from '@/database';

import { IIndustry } from '@/types/industry.types';

const industriesCol = db.collection<WithoutId<IIndustry>>('industries');

export const createIndustry = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ msg: 'Bad request' });
    }

    const data: WithoutId<IIndustry> = {
      name,
    };

    const newIndustry = await industriesCol.insertOne(data);

    return res.json({ ...data, _id: newIndustry.insertedId });
  } catch (error) {
    console.log('admin createIndustry ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const updateIndustry = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ msg: 'Bad request' });
    }

    const industry = await industriesCol.findOne({ _id: new ObjectId(id) });
    if (!industry) {
      return res.status(404).json({ msg: 'Not found industry' });
    }

    await industriesCol.updateOne({ _id: industry._id }, { $set: { name } });

    return res.json({ ...industry, name });
  } catch (error) {
    console.log('admin updateIndustry ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getIndustries = async (_: Request, res: Response) => {
  try {
    const industries = await industriesCol.find().toArray();

    return res.json(industries);
  } catch (error) {
    console.log('admin getIndustries ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getIndustry = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const industry = await industriesCol.findOne({ _id: new ObjectId(id) });
    if (!industry) {
      return res.status(404).json({ msg: 'Not found industry' });
    }

    return res.json(industry);
  } catch (error) {
    console.log('admin getIndustry ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const deleteIndustry = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const industry = await industriesCol.findOne({ _id: new ObjectId(id) });
    if (!industry) {
      return res.status(404).json({ msg: 'Not found industry' });
    }

    await industriesCol.deleteOne({ _id: industry._id });

    return res.json({ msg: 'success' });
  } catch (error) {
    console.log('admin deleteIndustry ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
