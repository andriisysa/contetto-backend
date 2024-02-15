import type { Request, Response } from 'express';
import { ObjectId, WithoutId } from 'mongodb';

import { db } from '@/database';

import { IAgentProfile } from '@/types/agentProfile.types';
import { IBrochure } from '@/types/brochure.types';
import { ITemplateImage, ITemplateLayout, TemplateType } from '@/types/template.types';
import { getImageExtension } from '@/utils/extension';
import { deleteS3Objects, uploadBase64ToS3 } from '@/utils/s3';
import { getNow } from '@/utils';

const brochuresCol = db.collection<WithoutId<IBrochure>>('brochures');
const listingsCol = db.collection('mlsListings');
const templateLayoutsCol = db.collection<WithoutId<ITemplateLayout>>('templateLayouts');
const templateImagesCol = db.collection<WithoutId<ITemplateImage>>('templateImages');

// brochures
export const createBrochure = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;

    const { propertyId, layoutId, data, type = TemplateType.social } = req.body;
    const property = await listingsCol.findOne({ _id: new ObjectId(propertyId) });
    if (!property) {
      return res.status(404).json({ msg: 'not found property' });
    }

    const layout = await templateLayoutsCol.findOne({ _id: new ObjectId(layoutId) });
    if (!layout) {
      return res.status(404).json({ msg: 'not found layout' });
    }

    const brochureData: WithoutId<IBrochure> = {
      orgId: agent.orgId,
      creator: agent.username,
      propertyId: property._id,
      property,
      layoutId: layout._id,
      layout,
      type,
      createdAt: getNow(),
      data,
    };

    const newBrochure = await brochuresCol.insertOne(data);

    return res.json({ ...brochureData, _id: newBrochure.insertedId });
  } catch (error) {
    console.log('createBrochure ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getBrochures = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;

    const brochures = await brochuresCol.find({ orgId: agent.orgId, creator: agent.username }).toArray();

    return res.json(brochures);
  } catch (error) {
    console.log('getBrochures ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getBrochure = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;

    const { brochureId } = req.params;

    const brochure = await brochuresCol.findOne({
      _id: new ObjectId(brochureId),
      orgId: agent.orgId,
      creator: agent.username,
    });

    if (!brochure) {
      return res.status(404).json({ msg: 'not found brochure' });
    }

    return res.json(brochure);
  } catch (error) {
    console.log('getBrochure ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const updateBrochure = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;
    const { brochureId } = req.params;
    const { data } = req.body;

    const brochure = await brochuresCol.findOne({
      _id: new ObjectId(brochureId),
      orgId: agent.orgId,
      creator: agent.username,
    });

    if (!brochure) {
      return res.status(404).json({ msg: 'not found brochure' });
    }

    await brochuresCol.updateOne({ _id: brochure._id }, { $set: { data } });

    return res.json({ ...brochure, data });
  } catch (error) {
    console.log('updateBrochure ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const deleteBrochure = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;
    const { brochureId } = req.params;

    const brochure = await brochuresCol.findOne({
      _id: new ObjectId(brochureId),
      orgId: agent.orgId,
      creator: agent.username,
    });

    if (!brochure) {
      return res.status(404).json({ msg: 'not found brochure' });
    }
    await brochuresCol.deleteOne({ _id: brochure._id });

    return res.json({ msg: 'success' });
  } catch (error) {
    console.log('deleteBrochure ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

// Brochure images
export const uploadBrochureImage = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;

    const { name, imageData, imageType } = req.body;
    if (!name || !imageData || !imageType) {
      return res.status(400).json({ msg: 'Bad request' });
    }

    const imageExtension = getImageExtension(imageType);
    if (!imageExtension) {
      return res.status(400).json({ msg: 'Invalid image type' });
    }

    const { url, s3Key } = await uploadBase64ToS3(
      'orgs/template-images',
      name.split('.')[0],
      imageData,
      imageType,
      imageExtension
    );

    const data: WithoutId<ITemplateImage> = {
      name,
      username: agent.username,
      url,
      s3Key,
      mimetype: imageType,
      ext: imageExtension,
      orgId: agent.orgId,
    };

    const newImage = await templateImagesCol.insertOne(data);

    return res.json({ ...data, _id: newImage.insertedId });
  } catch (error) {
    console.log('uploadBrochureImage ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getBrochureImages = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;

    const images = await templateImagesCol.find({ orgId: agent.orgId }).toArray();

    return res.json(images);
  } catch (error) {
    console.log('getBrochureImages ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const deleteBrochureImage = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;
    const { imageId } = req.params;

    const image = await templateImagesCol.findOne({ _id: new ObjectId(imageId), orgId: agent.orgId });
    if (!image) {
      return res.status(404).json({ msg: 'Not found template' });
    }

    await templateImagesCol.deleteOne({ _id: image._id });

    await deleteS3Objects([image.s3Key]);

    return res.json({ msg: 'success' });
  } catch (error) {
    console.log('deleteBrochureImage ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
