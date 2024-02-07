import type { Request, Response } from 'express';
import { ObjectId, WithoutId } from 'mongodb';

import { db } from '@/database';

import { ITemplate } from '@/types/template.types';
import { IOrgTemplate } from '@/types/orgTemplate.types';
import { AgentRole, IAgentProfile } from '@/types/agentProfile.types';

const templatesCol = db.collection<WithoutId<ITemplate>>('templates');
const orgTemplatesCol = db.collection<WithoutId<IOrgTemplate>>('orgTemplates');

// owner get all available templates
export const getTemplates = async (req: Request, res: Response) => {
  try {
    const templates = await templatesCol
      .aggregate([
        {
          $match: {},
        },
        {
          $lookup: {
            from: 'templateLayouts',
            localField: 'layoutId',
            foreignField: '_id',
            as: 'layout',
          },
        },
        {
          $unwind: {
            path: '$layout',
          },
        },
      ])
      .toArray();

    return res.json(templates);
  } catch (error) {
    console.log('getTemplates ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

// org templates
export const addOrgTemplate = async (req: Request, res: Response) => {
  try {
    const owner = req.agentProfile as IAgentProfile;

    const { templateId } = req.body;
    const template = await templatesCol.findOne({ _id: new ObjectId(templateId) });
    if (!template) {
      return res.status(404).json({ msg: 'not found template' });
    }

    const data: WithoutId<IOrgTemplate> = {
      orgId: owner.orgId,
      templateId: template._id,
      hidden: false,
    };

    const newOrgTemplate = await orgTemplatesCol.insertOne(data);

    return res.json({ ...data, template, _id: newOrgTemplate.insertedId });
  } catch (error) {
    console.log('addOrgTemplate ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getOrgTemplates = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;

    const query: Partial<IOrgTemplate> = { orgId: agent.orgId };
    if (agent.role !== AgentRole.owner) {
      query.hidden = false;
    }

    const orgTemplates = await orgTemplatesCol
      .aggregate([
        { $match: query },
        {
          $lookup: {
            from: 'orgTemplates',
            localField: 'templateId',
            foreignField: '_id',
            pipeline: [
              {
                $lookup: {
                  from: 'templateLayouts',
                  localField: 'layoutId',
                  foreignField: '_id',
                  as: 'layout',
                },
              },
              {
                $unwind: {
                  path: '$layout',
                },
              },
            ],
            as: 'template',
          },
        },
        {
          $unwind: {
            path: '$template',
          },
        },
      ])
      .toArray();

    return res.json(orgTemplates);
  } catch (error) {
    console.log('getOrgTemplates ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getOrgTemplate = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;
    const { templateId } = req.params;

    const query: Partial<IOrgTemplate> = { _id: new ObjectId(templateId), orgId: agent.orgId };
    if (agent.role !== AgentRole.owner) {
      query.hidden = false;
    }

    const orgTemplates = await orgTemplatesCol
      .aggregate([
        { $match: query },
        {
          $lookup: {
            from: 'orgTemplates',
            localField: 'templateId',
            foreignField: '_id',
            pipeline: [
              {
                $lookup: {
                  from: 'templateLayouts',
                  localField: 'layoutId',
                  foreignField: '_id',
                  as: 'layout',
                },
              },
              {
                $unwind: {
                  path: '$layout',
                },
              },
            ],
            as: 'template',
          },
        },
        {
          $unwind: {
            path: '$template',
          },
        },
      ])
      .toArray();
    if (orgTemplates.length === 0) {
      return res.status(404).json({ msg: 'not found template' });
    }

    return res.json(orgTemplates[0]);
  } catch (error) {
    console.log('getOrgTemplate ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const hideShowTemplate = async (req: Request, res: Response) => {
  try {
    const owner = req.agentProfile as IAgentProfile;
    const { templateId } = req.params;

    const orgTemplate = await orgTemplatesCol.findOne({ _id: new ObjectId(templateId), orgId: owner.orgId });
    if (!orgTemplate) {
      return res.status(404).json({ msg: 'not found template' });
    }

    const { hidden = false } = req.body;

    await orgTemplatesCol.updateOne({ _id: orgTemplate._id }, { $set: { hidden } });

    return res.json({ msg: 'success' });
  } catch (error) {
    console.log('hideShowTemplate ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const deleteOrgTemplate = async (req: Request, res: Response) => {
  try {
    const owner = req.agentProfile as IAgentProfile;
    const { templateId } = req.params;

    const orgTemplate = await orgTemplatesCol.findOne({ _id: new ObjectId(templateId), orgId: owner.orgId });
    if (!orgTemplate) {
      return res.status(404).json({ msg: 'not found template' });
    }

    await orgTemplatesCol.deleteOne({ _id: orgTemplate._id });

    return res.json({ msg: 'success' });
  } catch (error) {
    console.log('deleteOrgTemplate ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
