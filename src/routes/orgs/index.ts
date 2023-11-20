import express from 'express';

import validate from '@/middlewares/validation';
import { contactSchema, orgSchema, searchScheme } from '@/schema';
import {
  acceptInvite,
  create,
  deleteOne,
  getMyOrgs,
  getOne,
  getOrgMembers,
  inviteAgent,
  leaveOrg,
  removeMember,
  update,
} from '@/controllers/orgs';
import orgRoleAuth from '@/middlewares/roleAuth';
import { AgentRole } from '@/types/agentProfile.types';
import {
  bindContact,
  createContact,
  deleteContact,
  getContact,
  myContacts,
  searchContacts,
  shareContact,
  updateContact,
} from '@/controllers/contacts';
import {
  deleteSearchResult,
  getSearchProperties,
  getSearchResults,
  rejectProperty,
  saveSearch,
  searchListings,
  shareSearch,
  shortlistProperty,
} from '@/controllers/search';
import { getPriority } from 'os';
import { searchAuth, searchResultAuth } from '@/middlewares/searchAuth';

const orgsRouter = express.Router();

orgsRouter
  .post('', validate(orgSchema.create), create)
  .post('/', validate(orgSchema.create), create)
  .put('/:id', validate(orgSchema.create), orgRoleAuth(AgentRole.owner), update)
  .get('/:id', orgRoleAuth(AgentRole.agent), getOne)
  .get('', getMyOrgs)
  .delete('/:id', orgRoleAuth(AgentRole.owner), deleteOne)

  // agents
  .get('/:id/members', orgRoleAuth(AgentRole.agent), getOrgMembers)
  .post('/:id/invite-agent', validate(orgSchema.inviteAgent), orgRoleAuth(AgentRole.admin), inviteAgent)
  .post('/:id/invite-accept', validate(orgSchema.acceptInvite), acceptInvite)
  .post('/:id/remove-member', validate(orgSchema.removeMember), orgRoleAuth(AgentRole.admin), removeMember)
  .post('/:id/leave', orgRoleAuth(AgentRole.agent), leaveOrg)

  // contacts
  .post('/:id/contacts', validate(contactSchema.create), orgRoleAuth(AgentRole.agent), createContact)
  .get('/:id/contacts', orgRoleAuth(AgentRole.agent), myContacts)
  .get('/:id/contacts/:contactId', getContact)
  .put('/:id/contacts/:contactId', validate(contactSchema.create), orgRoleAuth(AgentRole.agent), updateContact)
  .delete('/:id/contacts/:contactId', orgRoleAuth(AgentRole.agent), deleteContact)
  .post('/:id/contacts/:contactId/share', orgRoleAuth(AgentRole.agent), shareContact)
  .post('/:id/contacts/:contactId/bind', validate(contactSchema.bind), bindContact)
  .get('/:id/contacts/search', orgRoleAuth(AgentRole.agent), searchContacts)

  // search
  .get('/:id/search', searchAuth, searchListings)
  .post('/:id/search-results/:searchId', validate(searchScheme.save), searchResultAuth(false), saveSearch)
  .post('/:id/search-results/:searchId/share', validate(searchScheme.share), orgRoleAuth(AgentRole.agent), shareSearch)
  .get('/:id/search-results', searchAuth, getSearchResults)
  .get('/:id/search-results/:searchId', searchResultAuth(true), getSearchProperties)
  .delete('/:id/search-results/:searchId', searchResultAuth(false), deleteSearchResult)
  .get('/:id/search-results/:searchId/property/:propertyId', searchResultAuth(true), getPriority)
  .post('/:id/search-results/:searchId/property/:propertyId/shortlist', searchResultAuth(true), shortlistProperty)
  .post('/:id/search-results/:searchId/property/:propertyId/reject', searchResultAuth(true), rejectProperty);

export default orgsRouter;
