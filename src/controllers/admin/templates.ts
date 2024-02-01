import type { Request, Response } from 'express';
import { ObjectId, WithoutId } from 'mongodb';

import { db } from '@/database';

import { ITemplate, TemplateType } from '@/types/template.types';
import { IOrg } from '@/types/org.types';

const templatesCol = db.collection<WithoutId<ITemplate>>('templates');
const orgsCol = db.collection<WithoutId<IOrg>>('orgs');

export const createTemplate = async (req: Request, res: Response) => {
  try {
    const { name, isPublic = false, price = 0, type = TemplateType.brochure, orgIds = [], data } = req.body;

    if (!name || !data) {
      return res.status(400).json({ msg: 'Bad request' });
    }

    const orgs = await orgsCol.find({ _id: { $in: orgIds.map((orgId: string) => new ObjectId(orgId)) } }).toArray();
    if (orgIds.length !== orgs.length) {
      return res.status(400).json({ msg: 'Bad request' });
    }

    const templateData: WithoutId<ITemplate> = {
      name,
      data,
      isPublic,
      orgIds: orgs.map((org) => org._id),
      price,
      type,
    };

    const newTmp = await templatesCol.insertOne(templateData);

    return res.json({ ...templateData, _id: newTmp.insertedId });
  } catch (error) {
    console.log('admin createTemplate ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const updateTemplate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, isPublic = false, price = 0, type = TemplateType.brochure, orgIds = [], data } = req.body;

    if (!name || !data) {
      return res.status(400).json({ msg: 'Bad request' });
    }

    const template = await templatesCol.findOne({ _id: new ObjectId(id) });
    if (!template) {
      return res.status(404).json({ msg: 'Not found template' });
    }

    const orgs = await orgsCol.find({ _id: { $in: orgIds.map((orgId: string) => new ObjectId(orgId)) } }).toArray();
    if (orgIds.length !== orgs.length) {
      return res.status(400).json({ msg: 'Bad request' });
    }

    const templateData: WithoutId<ITemplate> = {
      name,
      data,
      isPublic,
      price,
      type,
      orgIds: orgs.map((org) => org._id),
    };

    await templatesCol.updateOne({ _id: template._id }, { $set: templateData });

    return res.json({ ...template, ...templateData });
  } catch (error) {
    console.log('admin updateTemplate ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getTemplates = async (req: Request, res: Response) => {
  try {
    const templates = await templatesCol.find().toArray();

    return res.json(templates);
  } catch (error) {
    console.log('admin getTemplates ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getTemplate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const template = await templatesCol.findOne({ _id: new ObjectId(id) });
    if (!template) {
      return res.status(404).json({ msg: 'Not found template' });
    }

    return res.json(template);
  } catch (error) {
    console.log('admin getTemplate ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const deleteTemplate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const template = await templatesCol.findOne({ _id: new ObjectId(id) });
    if (!template) {
      return res.status(404).json({ msg: 'Not found template' });
    }

    await templatesCol.deleteOne({ _id: template._id });

    return res.json({ msg: 'success' });
  } catch (error) {
    console.log('admin deleteTemplate ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
