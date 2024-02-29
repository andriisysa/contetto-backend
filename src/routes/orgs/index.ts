import express from 'express';

import validate from '@/middlewares/validation';
import { channelScheme, contactSchema, mediaScheme, orgSchema, pageScheme, searchScheme } from '@/schema';
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
  setBrand,
  setWhiteLabel,
  update,
  uploadBrandLogo,
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
  searchPropertiesByAddress,
} from '@/controllers/search';
import { agentOrContact, searchResultAuth } from '@/middlewares/searchAuth';
import {
  addMemberToChannel,
  archiveRoom,
  createChannel,
  createDm,
  removeMemberFromRoom,
  updateChannel,
} from '@/controllers/rooms';
import {
  addAttachment,
  deleteAttachment,
  loadBeforeMessages,
  loadMessages,
  loadNextMessages,
  loadSearchedessages,
  searchMessages,
} from '@/controllers/messages';
import {
  createFolder,
  deleteFiles,
  downloadFileUrl,
  getFileShareLink,
  getFolder,
  getPublicFileUrl,
  getUploadFileUrl,
  loadfile,
  moveFiles,
  renameFile,
  renameFolder,
  shareFile,
  shareFolder,
  shareForAgentOnlyFile,
  storeFile,
} from '@/controllers/media';
import { folderAuth } from '@/middlewares/folderAuth';
import {
  addOrgTemplate,
  deleteOrgTemplate,
  getOrgTemplate,
  getOrgTemplates,
  getTemplates,
  hideShowTemplate,
} from '@/controllers/templates';
import {
  copyBrochureLink,
  copySocialLink,
  createBrochure,
  deleteBrochure,
  deleteBrochureImage,
  downloadPDFForBrochureTemplate,
  getBrochure,
  getBrochureImages,
  getBrochures,
  updateBrochure,
  uploadBrochureImage,
} from '@/controllers/templates/brochure';
import {
  createPage,
  deletePage,
  deletePageImage,
  getMyPage,
  getMyPages,
  getPageImages,
  updatePage,
  uploadPageImage,
} from '@/controllers/pages';

const orgsRouter = express.Router();

orgsRouter
  .post('', validate(orgSchema.create), create)
  .post('/', validate(orgSchema.create), create)
  .put('/:id', validate(orgSchema.create), orgRoleAuth(AgentRole.owner), update)
  .get('/:id', orgRoleAuth(AgentRole.agent), getOne)
  .get('', getMyOrgs)
  .delete('/:id', orgRoleAuth(AgentRole.owner), deleteOne)
  .post('/:id/set-whitelabel', orgRoleAuth(AgentRole.admin), setWhiteLabel)
  .post('/:id/brand/logo', orgRoleAuth(AgentRole.owner), uploadBrandLogo)
  .post('/:id/brand', orgRoleAuth(AgentRole.owner), setBrand)

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
  .get('/:id/search/address', orgRoleAuth(AgentRole.agent), searchPropertiesByAddress)
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
  .post('/:id/channels/:roomId/remove-member', orgRoleAuth(AgentRole.admin), removeMemberFromRoom)
  .delete('/:id/channels/:roomId', orgRoleAuth(AgentRole.owner), archiveRoom)

  // messages
  .get('/:id/rooms/:roomId/messages', loadMessages)
  .get('/:id/rooms/:roomId/messages/load-before', loadBeforeMessages)
  .get('/:id/rooms/:roomId/messages/load-next', loadNextMessages)
  .get('/:id/rooms/:roomId/messages/search', searchMessages)
  .get('/:id/rooms/:roomId/messages/load-searched', loadSearchedessages)
  .post('/:id/rooms/:roomId/attachments', addAttachment)
  .delete('/:id/rooms/:roomId/attachments/:attachmentId', deleteAttachment)

  // folders and files
  .post('/:id/folders', validate(mediaScheme.create), agentOrContact, folderAuth, createFolder)
  .get('/:id/folders', agentOrContact, getFolder)
  .get('/:id/folders/:folderId', agentOrContact, folderAuth, getFolder)
  .put('/:id/folders/:folderId', validate(mediaScheme.create), agentOrContact, folderAuth, renameFolder)
  .post('/:id/folders/:folderId/share', agentOrContact, shareFolder)
  // here folderId is target folder id
  .post('/:id/folders/:folderId/move', validate(mediaScheme.move), agentOrContact, folderAuth, moveFiles)
  .delete('/:id/folders', validate(mediaScheme.move), agentOrContact, deleteFiles)

  .post('/:id/files/upload-url', validate(mediaScheme.uploadFile), agentOrContact, getUploadFileUrl)
  .post('/:id/files', validate(mediaScheme.storeFile), agentOrContact, folderAuth, storeFile)
  .post('/:id/files/:fileId/download-url', agentOrContact, downloadFileUrl)
  .get('/:id/files/:fileId/load', agentOrContact, loadfile)
  .get('/:id/files/:fileId/public-url', orgRoleAuth(AgentRole.agent), getPublicFileUrl)
  .put('/:id/files/:fileId/rename', validate(mediaScheme.create), agentOrContact, renameFile)
  .post('/:id/files/:fileId/share', validate(mediaScheme.shareFile), orgRoleAuth(AgentRole.agent), shareFile)
  .post('/:id/files/:fileId/share/:contactId', orgRoleAuth(AgentRole.agent), shareForAgentOnlyFile)
  .get('/:id/files/:fileId/share-link', orgRoleAuth(AgentRole.agent), getFileShareLink)

  // templates
  .get('/:id/templates', orgRoleAuth(AgentRole.owner), getTemplates)
  .post('/:id/org-templates', orgRoleAuth(AgentRole.owner), addOrgTemplate)
  .get('/:id/org-templates', orgRoleAuth(AgentRole.agent), getOrgTemplates)
  .get('/:id/org-templates/:templateId', orgRoleAuth(AgentRole.agent), getOrgTemplate)
  .put('/:id/org-templates/:templateId', orgRoleAuth(AgentRole.owner), hideShowTemplate)
  .delete('/:id/org-templates/:templateId', orgRoleAuth(AgentRole.owner), deleteOrgTemplate)

  // brochures
  .post('/:id/brochures', orgRoleAuth(AgentRole.agent), createBrochure)
  .get('/:id/brochures', orgRoleAuth(AgentRole.agent), getBrochures)
  .get('/:id/brochures/:brochureId', orgRoleAuth(AgentRole.agent), getBrochure)
  .put('/:id/brochures/:brochureId', orgRoleAuth(AgentRole.agent), updateBrochure)
  .delete('/:id/brochures/:brochureId', orgRoleAuth(AgentRole.agent), deleteBrochure)
  .post('/:id/brochures/download-brochure-pdf', orgRoleAuth(AgentRole.agent), downloadPDFForBrochureTemplate)
  .post('/:id/brochures/:brochureId/copy-social-link', orgRoleAuth(AgentRole.agent), copySocialLink)
  .post('/:id/brochures/:brochureId/copy-brochure-link', orgRoleAuth(AgentRole.agent), copyBrochureLink)

  // brochure images
  .post('/:id/brochure-images', orgRoleAuth(AgentRole.agent), uploadBrochureImage)
  .get('/:id/brochure-images', orgRoleAuth(AgentRole.agent), getBrochureImages)
  .delete('/:id/brochure-images/:imageId', orgRoleAuth(AgentRole.agent), deleteBrochureImage)

  // pages
  .post('/:id/pages', validate(pageScheme.create), orgRoleAuth(AgentRole.agent), createPage)
  .get('/:id/pages', orgRoleAuth(AgentRole.agent), getMyPages)
  .get('/:id/pages/:pageId', orgRoleAuth(AgentRole.agent), getMyPage)
  .put('/:id/pages/:pageId', validate(pageScheme.create), orgRoleAuth(AgentRole.agent), updatePage)
  .delete('/:id/pages/:pageId', orgRoleAuth(AgentRole.agent), deletePage)

  // page images
  .post('/:id/page-images', orgRoleAuth(AgentRole.agent), uploadPageImage)
  .get('/:id/page-images', orgRoleAuth(AgentRole.agent), getPageImages)
  .delete('/:id/page-images/:imageId', orgRoleAuth(AgentRole.agent), deletePageImage);

export default orgsRouter;
