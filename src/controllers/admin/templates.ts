import type { Request, Response } from 'express';
import { ObjectId, WithoutId } from 'mongodb';

import { db } from '@/database';

import { ITemplate, ITemplateImage, ITemplateLayout, TemplateType } from '@/types/template.types';
import { IOrg } from '@/types/org.types';
import { getNow } from '@/utils';
import { getImageExtension } from '@/utils/extension';
import { deleteS3Objects, uploadBase64ToS3 } from '@/utils/s3';
import { IUser } from '@/types/user.types';
import { IIndustry } from '@/types/industry.types';

const templatesCol = db.collection<WithoutId<ITemplate>>('templates');
const templateLayoutsCol = db.collection<WithoutId<ITemplateLayout>>('templateLayouts');
const orgsCol = db.collection<WithoutId<IOrg>>('orgs');
const templateImagesCol = db.collection<WithoutId<ITemplateImage>>('templateImages');
const industriesCol = db.collection<WithoutId<IIndustry>>('industries');

export const createTemplate = async (req: Request, res: Response) => {
  try {
    const {
      name,
      isPublic = false,
      price = 0,
      type = TemplateType.brochure,
      orgIds = [],
      layoutId,
      industryIds = [],
      data,
    } = req.body;

    if (!name || !data) {
      return res.status(400).json({ msg: 'Bad request' });
    }

    const orgs = await orgsCol.find({ _id: { $in: orgIds.map((orgId: string) => new ObjectId(orgId)) } }).toArray();
    if (orgIds.length !== orgs.length) {
      return res.status(400).json({ msg: 'Bad request' });
    }

    const layout = await templateLayoutsCol.findOne({ _id: new ObjectId(layoutId) });
    if (!layout) {
      return res.status(400).json({ msg: 'Bad request' });
    }

    const industries = await industriesCol
      .find({
        _id: { $in: industryIds.map((id: string) => new ObjectId(id)) },
      })
      .toArray();
    if (industryIds.length !== industries.length) {
      return res.status(400).json({ msg: 'Bad request' });
    }

    const templateData: WithoutId<ITemplate> = {
      name,
      data,
      isPublic,
      orgIds: orgs.map((org) => org._id),
      price,
      type,
      layoutId: layout._id,
      layout,
      industryIds: industries.map((industry) => industry._id),
      industries,
      createdAt: getNow(),
      updatedAt: getNow(),
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
    const {
      name,
      isPublic = false,
      price = 0,
      type = TemplateType.brochure,
      orgIds = [],
      layoutId,
      industryIds = [],
      data,
    } = req.body;

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

    const layout = await templateLayoutsCol.findOne({ _id: new ObjectId(layoutId) });
    if (!layout) {
      return res.status(400).json({ msg: 'Not found layout' });
    }

    const industries = await industriesCol
      .find({
        _id: { $in: industryIds.map((id: string) => new ObjectId(id)) },
      })
      .toArray();
    if (industryIds.length !== industries.length) {
      return res.status(400).json({ msg: 'Bad request' });
    }

    const templateData: WithoutId<ITemplate> = {
      ...template,
      name,
      data,
      isPublic,
      price,
      type,
      orgIds: orgs.map((org) => org._id),
      layoutId: layout._id,
      layout,
      industryIds: industries.map((industry) => industry._id),
      industries,
      updatedAt: getNow(),
    };

    await templatesCol.updateOne({ _id: template._id }, { $set: templateData });

    return res.json(templateData);
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

export const uploadTemplateImage = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;

    const { name, imageData, imageType } = req.body;
    if (!name || !imageData || !imageType) {
      return res.status(400).json({ msg: 'Bad request' });
    }

    const imageExtension = getImageExtension(imageType);
    if (!imageExtension) {
      return res.status(400).json({ msg: 'Invalid image type' });
    }

    const { url, s3Key } = await uploadBase64ToS3(
      'template-images',
      name.split('.')[0],
      imageData,
      imageType,
      imageExtension
    );

    const data = {
      name,
      username: user.username,
      url,
      s3Key,
      mimeType: imageType,
      ext: imageExtension,
      orgId: undefined,
    };

    const newImage = await templateImagesCol.insertOne(data);

    return res.json({ ...data, _id: newImage.insertedId });
  } catch (error) {
    console.log('admin uploadTemplateImages ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getTemplateImages = async (req: Request, res: Response) => {
  try {
    const images = await templateImagesCol.find({ orgId: undefined }).toArray();

    return res.json(images);
  } catch (error) {
    console.log('admin getTemplateImages ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const deleteTemplateImage = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const image = await templateImagesCol.findOne({ _id: new ObjectId(id) });
    if (!image) {
      return res.status(404).json({ msg: 'Not found template' });
    }

    await templateImagesCol.deleteOne({ _id: image._id });

    await deleteS3Objects([image.s3Key]);

    return res.json({ msg: 'success' });
  } catch (error) {
    console.log('admin deleteTemplateImage ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
