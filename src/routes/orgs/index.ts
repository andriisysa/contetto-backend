import express from 'express';

import validate from '@/middlewares/validation';
import { orgSchema } from '@/schema';
import {
  acceptInvite,
  create,
  deleteOne,
  getMyOrgs,
  getOne,
  getOrgMembers,
  inviteAgent,
  inviteContact,
  leaveOrg,
  removeMember,
  update,
} from '@/controllers/orgs';
import orgRoleAuth from '@/middlewares/roleAuth';
import { AgentRole } from '@/types/agentProfile.types';

const orgsRouter = express.Router();

orgsRouter
  .post('', validate(orgSchema.create), create)
  .post('/', validate(orgSchema.create), create)
  .put('/:id', validate(orgSchema.create), orgRoleAuth(AgentRole.owner), update)
  .get('/:id', orgRoleAuth('contact' as AgentRole), getOne)
  .get('', getMyOrgs)
  .get('/:id/members', orgRoleAuth(AgentRole.agent), getOrgMembers)
  .delete('/:id', orgRoleAuth(AgentRole.owner), deleteOne)
  .post('/:id/invite-agent', validate(orgSchema.inviteAgent), orgRoleAuth(AgentRole.admin), inviteAgent)
  .post('/:id/invite-contact', validate(orgSchema.inviteContact), orgRoleAuth(AgentRole.agent), inviteContact)
  .post('/:id/invite-accept', validate(orgSchema.acceptInvite), acceptInvite)
  .post('/:id/remove-member', validate(orgSchema.removeMember), orgRoleAuth(AgentRole.admin), removeMember)
  .post('/:id/leave', orgRoleAuth(AgentRole.agent), leaveOrg);

export default orgsRouter;
