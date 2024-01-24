import express from 'express';

import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  getTemplates,
  updateTemplate,
} from '@/controllers/admin/templates';
import { getOrgs } from '@/controllers/admin/orgs';

const adminRouter = express.Router();

adminRouter
  .post('/templates', createTemplate)
  .get('/templates', getTemplates)
  .get('/templates/:id', getTemplate)
  .put('/templates/:id', updateTemplate)
  .delete('/templates/:id', deleteTemplate)

  .get('/orgs', getOrgs);

export default adminRouter;
