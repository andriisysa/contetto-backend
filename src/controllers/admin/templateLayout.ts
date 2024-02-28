import type { Request, Response } from 'express';
import { ObjectId, WithoutId } from 'mongodb';

import { db } from '@/database';

import { ITemplateLayout } from '@/types/template.types';

const templateLayoutsCol = db.collection<WithoutId<ITemplateLayout>>('templateLayouts');

export const createTemplateLayout = async (req: Request, res: Response) => {
  try {
    const { name, width, height, type } = req.body;

    const data: WithoutId<ITemplateLayout> = {
      name,
      width,
      height,
      type,
    };

    const layout = await templateLayoutsCol.insertOne(data);

    return res.json({ ...data, _id: layout.insertedId });
  } catch (error) {
    console.log('admin createTemplateLayout ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const updateTemplateLayout = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, width, height, type } = req.body;

    const layout = await templateLayoutsCol.findOne({ _id: new ObjectId(id) });
    if (!layout) {
      return res.status(404).json({ msg: 'Not found layout' });
    }

    const data: WithoutId<ITemplateLayout> = {
      name,
      width,
      height,
      type,
    };

    await templateLayoutsCol.updateOne({ _id: layout._id }, { $set: data });

    return res.json({ ...layout, data });
  } catch (error) {
    console.log('admin updateTemplateLayout ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getTemplateLayouts = async (req: Request, res: Response) => {
  try {
    const layouts = await templateLayoutsCol.find().toArray();

    return res.json(layouts);
  } catch (error) {
    console.log('admin getTemplateLayouts ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getTemplateLayout = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const layout = await templateLayoutsCol.findOne({ _id: new ObjectId(id) });
    if (!layout) {
      return res.status(404).json({ msg: 'Not found layout' });
    }

    return res.json(layout);
  } catch (error) {
    console.log('admin getTemplateLayout ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const deleteTemplateLayout = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const layout = await templateLayoutsCol.findOne({ _id: new ObjectId(id) });
    if (!layout) {
      return res.status(404).json({ msg: 'Not found layout' });
    }

    await templateLayoutsCol.deleteOne({ _id: layout._id });

    return res.json({ msg: 'success' });
  } catch (error) {
    console.log('admin deleteTemplate ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
