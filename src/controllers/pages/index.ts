import type { Request, Response } from 'express';
import { ObjectId, WithoutId } from 'mongodb';

import { db } from '@/database';

import { IAgentProfile } from '@/types/agentProfile.types';
import { ITemplateImage } from '@/types/template.types';
import { getImageExtension } from '@/utils/extension';
import { deleteS3Objects, uploadBase64ToS3 } from '@/utils/s3';
import { getNow } from '@/utils';
import { IPage } from '@/types/page.types';
import slugify from 'slugify';

const pagesCol = db.collection<WithoutId<IPage>>('pages');
const pageImagesCol = db.collection<WithoutId<ITemplateImage>>('pageImages');

// pages
export const createPage = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;

    const { title, html, css, isPublished = false } = req.body;

    const page = await pagesCol.findOne({ title });
    if (page) {
      return res.status(400).json({ msg: 'The same title already exists' });
    }

    const data: WithoutId<IPage> = {
      orgId: agent.orgId,
      creator: agent.username,
      title,
      slug: slugify(title),
      html,
      css,
      isPublished,
      timestamp: getNow(),
    };

    const newPage = await pagesCol.insertOne(data);

    return res.json({ ...data, _id: newPage.insertedId });
  } catch (error) {
    console.log('createPage ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getMyPages = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;

    const pages = await pagesCol.find({ orgId: agent.orgId, creator: agent.username }).toArray();

    return res.json(pages);
  } catch (error) {
    console.log('getMyPages ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getMyPage = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;

    const { pageId } = req.params;

    const page = await pagesCol.findOne({
      _id: new ObjectId(pageId),
      orgId: agent.orgId,
      creator: agent.username,
    });

    if (!page) {
      return res.status(404).json({ msg: 'not found page' });
    }

    return res.json(page);
  } catch (error) {
    console.log('getMyPage ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const updatePage = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;
    const { pageId } = req.params;
    const { title, html, css, isPublished = false } = req.body;

    const page = await pagesCol.findOne({
      _id: new ObjectId(pageId),
      orgId: agent.orgId,
      creator: agent.username,
    });

    if (!page) {
      return res.status(404).json({ msg: 'not found page' });
    }

    const exists = await pagesCol.findOne({
      _id: { $ne: page._id },
      title,
    });
    if (exists) {
      return res.status(400).json({ msg: 'The same title already exists' });
    }

    const data: WithoutId<IPage> = {
      ...page,
      title,
      slug: slugify(title),
      html,
      css,
      isPublished,
    };

    await pagesCol.updateOne({ _id: page._id }, { $set: { data } });

    return res.json(data);
  } catch (error) {
    console.log('updatePage ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const deletePage = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;
    const { pageId } = req.params;

    const page = await pagesCol.findOne({
      _id: new ObjectId(pageId),
      orgId: agent.orgId,
      creator: agent.username,
    });

    if (!page) {
      return res.status(404).json({ msg: 'not found page' });
    }

    await pagesCol.deleteOne({ _id: page._id });

    return res.json({ msg: 'success' });
  } catch (error) {
    console.log('deletePage ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

// Page images
export const uploadPageImage = async (req: Request, res: Response) => {
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
      'orgs/page-images',
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

    const newImage = await pageImagesCol.insertOne(data);

    return res.json({ ...data, _id: newImage.insertedId });
  } catch (error) {
    console.log('uploadPageImage ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getPageImages = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;

    const images = await pageImagesCol.find({ orgId: agent.orgId, username: agent.username }).toArray();

    return res.json(images);
  } catch (error) {
    console.log('getPageImages ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const deletePageImage = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;
    const { imageId } = req.params;

    const image = await pageImagesCol.findOne({
      _id: new ObjectId(imageId),
      orgId: agent.orgId,
      username: agent.username,
    });
    if (!image) {
      return res.status(404).json({ msg: 'Not found template' });
    }

    await pageImagesCol.deleteOne({ _id: image._id });

    await deleteS3Objects([image.s3Key]);

    return res.json({ msg: 'success' });
  } catch (error) {
    console.log('deletePageImages ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getPublicPages = async (req: Request, res: Response) => {
  try {
    const pages = await pagesCol.find({ isPublished: true }).toArray();

    return res.json(pages);
  } catch (error) {
    console.log('getPublicPages ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getPageBySlug = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const page = await pagesCol.findOne({
      isPublished: true,
      slug,
    });

    if (!page) {
      return res.status(404).json({ msg: 'not found page' });
    }

    return res.json(page);
  } catch (error) {
    console.log('getPageBySlug ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
