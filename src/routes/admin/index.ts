import express from 'express';

import adminAuth from '@/middlewares/adminAuth';
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  getTemplates,
  updateTemplate,
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

  .get('/orgs', adminAuth, getOrgs)
  .get('/org/:id', adminAuth, getOrg);

export default adminRouter;
