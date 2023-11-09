import express from 'express';

import validate from '@/middlewares/validation';
import { orgSchema } from '@/schema';
import { acceptInvite, create, deleteOne, getOne, invite, update } from '@/controllers/orgs';
import orgRoleAuth from '@/middlewares/roleAuth';
import { AgentRole } from '@/types/agentProfile.types';

const orgsRouter = express.Router();

orgsRouter
  .post('', validate(orgSchema.create), create)
  .post('/', validate(orgSchema.create), create)
  .put('/:id', validate(orgSchema.create), orgRoleAuth(AgentRole.owner), update)
  .get('/:id', getOne)
  .delete('/:id', orgRoleAuth(AgentRole.owner), deleteOne)
  .post('/:id/invite', orgRoleAuth(AgentRole.admin), invite)
  .post('/:id/invite-accept', acceptInvite);

export default orgsRouter;
