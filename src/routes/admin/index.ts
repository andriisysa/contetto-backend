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

  .get('/orgs', adminAuth, getOrgs)
  .get('/org/:id', adminAuth, getOrg);

export default adminRouter;
