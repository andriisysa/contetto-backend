import express from 'express';

import validate from '@/middlewares/validation';
import { channelScheme, contactSchema, mediaScheme, orgSchema, searchScheme } from '@/schema';
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
  setWhiteLabel,
  update,
} from '@/controllers/orgs';
import orgRoleAuth from '@/middlewares/roleAuth';
import { AgentRole } from '@/types/agentProfile.types';
import {
  bindContact,
  createContact,
  createNote,
  deleteContact,
  deleteNote,
  getContact,
  getNotes,
  myContacts,
  searchContacts,
  shareContact,
  updateContact,
  updateNote,
} from '@/controllers/contacts';
import {
  deleteSearchResult,
  getContactSearchResults,
  getProperty,
  getSearchProperties,
  getMySearchResults,
  rejectProperty,
  saveSearch,
  searchListings,
  shareSearch,
  shortlistProperty,
  undoProperty,
  shareProperty,
} from '@/controllers/search';
import { agentOrContact, searchResultAuth } from '@/middlewares/searchAuth';
import { addMemberToChannel, createChannel, createDm, updateChannel } from '@/controllers/rooms';
import { loadMessages, loadMoreMessages } from '@/controllers/messages';
import {
  createFolder,
  deleteFiles,
  deleteFolder,
  downloadFileUrl,
  getFolder,
  getUploadFileUrl,
  loadfile,
  moveFiles,
  moveFolder,
  renameFile,
  renameFolder,
  storeFile,
} from '@/controllers/media';
import { folderAuth } from '@/middlewares/folderAuth';

const orgsRouter = express.Router();

orgsRouter
  .post('', validate(orgSchema.create), create)
  .post('/', validate(orgSchema.create), create)
  .put('/:id', validate(orgSchema.create), orgRoleAuth(AgentRole.owner), update)
  .get('/:id', orgRoleAuth(AgentRole.agent), getOne)
  .get('', getMyOrgs)
  .delete('/:id', orgRoleAuth(AgentRole.owner), deleteOne)
  .post('/:id/set-whitelabel', orgRoleAuth(AgentRole.admin), setWhiteLabel)

  // agents
  .get('/:id/members', orgRoleAuth(AgentRole.agent), getOrgMembers)
  .post('/:id/invite-agent', validate(orgSchema.inviteAgent), orgRoleAuth(AgentRole.admin), inviteAgent)
  .post('/:id/invite-accept', validate(orgSchema.acceptInvite), acceptInvite)
  .post('/:id/remove-member', validate(orgSchema.removeMember), orgRoleAuth(AgentRole.admin), removeMember)
  .post('/:id/leave', orgRoleAuth(AgentRole.agent), leaveOrg)

  // contacts
  .post('/:id/contacts', validate(contactSchema.create), orgRoleAuth(AgentRole.agent), createContact)
  .get('/:id/contacts', orgRoleAuth(AgentRole.agent), myContacts)
  .get('/:id/contacts/search', orgRoleAuth(AgentRole.agent), searchContacts)
  .get('/:id/contacts/:contactId', getContact)
  .put('/:id/contacts/:contactId', validate(contactSchema.create), orgRoleAuth(AgentRole.agent), updateContact)
  .delete('/:id/contacts/:contactId', orgRoleAuth(AgentRole.agent), deleteContact)
  .post('/:id/contacts/:contactId/share', orgRoleAuth(AgentRole.agent), shareContact)
  .post('/:id/contacts/:contactId/bind', validate(contactSchema.bind), bindContact)

  // contact notes
  .get('/:id/contacts/:contactId/notes', orgRoleAuth(AgentRole.agent), getNotes)
  .post('/:id/contacts/:contactId/notes', validate(contactSchema.note), orgRoleAuth(AgentRole.agent), createNote)
  .put('/:id/contacts/:contactId/notes/:noteId', validate(contactSchema.note), orgRoleAuth(AgentRole.agent), updateNote)
  .delete('/:id/contacts/:contactId/notes/:noteId', orgRoleAuth(AgentRole.agent), deleteNote)

  // search
  .get('/:id/search', agentOrContact, searchListings)
  .post('/:id/search-results/:searchId', validate(searchScheme.save), searchResultAuth(false), saveSearch)
  .post('/:id/search-results/:searchId/share', validate(searchScheme.share), orgRoleAuth(AgentRole.agent), shareSearch)
  // get search results for me whether it's an agent or a contact
  .get('/:id/search-results', agentOrContact, getMySearchResults)
  // as an agent, get search results for a specific contact
  .get('/:id/search-results/contacts/:contactId', orgRoleAuth(AgentRole.agent), getContactSearchResults)
  .get('/:id/search-results/:searchId', searchResultAuth(true), getSearchProperties)
  .delete('/:id/search-results/:searchId', searchResultAuth(false), deleteSearchResult)
  .get('/:id/search-results/:searchId/property/:propertyId', searchResultAuth(true), getProperty)
  .post('/:id/search-results/:searchId/property/:propertyId/shortlist', searchResultAuth(true), shortlistProperty)
  .post('/:id/search-results/:searchId/property/:propertyId/reject', searchResultAuth(true), rejectProperty)
  .post('/:id/search-results/:searchId/property/:propertyId/undo', searchResultAuth(true), undoProperty)
  .post(
    '/:id/search-results/:searchId/property/:propertyId/share',
    validate(searchScheme.share),
    orgRoleAuth(AgentRole.agent),
    searchResultAuth(false),
    shareProperty
  )

  // channels/dms
  .post('/:id/channels', validate(channelScheme.create), orgRoleAuth(AgentRole.agent), createChannel)
  .post('/:id/dms', orgRoleAuth(AgentRole.agent), createDm)
  .put('/:id/channels/:roomId', validate(channelScheme.create), orgRoleAuth(AgentRole.agent), updateChannel)
  .post('/:id/channels/:roomId/add-members', orgRoleAuth(AgentRole.agent), addMemberToChannel)

  // messages
  .get('/:id/rooms/:roomId/messages', loadMessages)
  .get('/:id/rooms/:roomId/messages/more', loadMoreMessages)

  // folders and files
  .post('/:id/folders', validate(mediaScheme.create), agentOrContact, folderAuth, createFolder)
  .get('/:id/folders', agentOrContact, getFolder)
  .get('/:id/folders/:folderId', agentOrContact, folderAuth, getFolder)
  .put('/:id/folders/:folderId', validate(mediaScheme.create), agentOrContact, folderAuth, renameFolder)
  .post('/:id/folders/:folderId/move', validate(mediaScheme.move), agentOrContact, folderAuth, moveFolder)
  .delete('/:id/folders/:folderId', agentOrContact, folderAuth, deleteFolder)

  .post('/:id/files/upload-url', validate(mediaScheme.create), agentOrContact, getUploadFileUrl)
  .post('/:id/files', validate(mediaScheme.storeFile), agentOrContact, folderAuth, storeFile)
  .post('/:id/files/:fileId/download-url', agentOrContact, folderAuth, downloadFileUrl)
  .get('/:id/files/:fileId/load', agentOrContact, folderAuth, loadfile)
  .put('/:id/files/:fileId/rename', validate(mediaScheme.create), agentOrContact, folderAuth, renameFile)
  .post('/:id/files/move', validate(mediaScheme.filesMove), agentOrContact, folderAuth, moveFiles)
  .delete('/:id/files', validate(mediaScheme.files), agentOrContact, folderAuth, deleteFiles);

export default orgsRouter;
