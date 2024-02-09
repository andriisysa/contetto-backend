import express from 'express';

import adminAuth from '@/middlewares/adminAuth';
import {
  createTemplate,
  deleteTemplate,
  deleteTemplateImage,
  getTemplate,
  getTemplateImages,
  getTemplates,
  updateTemplate,
  uploadTemplateImage,
} from '@/controllers/admin/templates';
import { getOrg, getOrgs } from '@/controllers/admin/orgs';
import { adminGetMe, adminLogin } from '@/controllers/admin/auth';
import {
  createTemplateLayout,
  deleteTemplateLayout,
  getTemplateLayout,
  getTemplateLayouts,
  updateTemplateLayout,
} from '@/controllers/admin/templateLayout';
import { templateLayoutScheme } from '@/schema';
import validate from '@/middlewares/validation';
import {
  createIndustry,
  deleteIndustry,
  getIndustries,
  getIndustry,
  updateIndustry,
} from '@/controllers/admin/industry';

const adminRouter = express.Router();

adminRouter
  .post('/login', adminLogin)
  .get('/me', adminAuth, adminGetMe)

  .post('/templates', adminAuth, createTemplate)
  .get('/templates', adminAuth, getTemplates)
  .get('/templates/:id', adminAuth, getTemplate)
  .put('/templates/:id', adminAuth, updateTemplate)
  .delete('/templates/:id', adminAuth, deleteTemplate)

  .post('/template-images', adminAuth, uploadTemplateImage)
  .get('/template-images', adminAuth, getTemplateImages)
  .delete('/template-images/:id', adminAuth, deleteTemplateImage)

  .post('/template-layouts', validate(templateLayoutScheme.create), adminAuth, createTemplateLayout)
  .get('/template-layouts', adminAuth, getTemplateLayouts)
  .get('/template-layouts/:id', adminAuth, getTemplateLayout)
  .put('/template-layouts/:id', validate(templateLayoutScheme.create), adminAuth, updateTemplateLayout)
  .delete('/template-layouts/:id', adminAuth, deleteTemplateLayout)

  .get('/orgs', adminAuth, getOrgs)
  .get('/org/:id', adminAuth, getOrg)

  .post('/industries', adminAuth, createIndustry)
  .get('/industries', adminAuth, getIndustries)
  .get('/industries/:id', adminAuth, getIndustry)
  .put('/industries/:id', adminAuth, updateIndustry)
  .delete('/industries/:id', adminAuth, deleteIndustry);

export default adminRouter;
