import type { Request, Response } from 'express';
import { ObjectId, WithoutId } from 'mongodb';

import { db } from '@/database';

import { IAgentProfile } from '@/types/agentProfile.types';
import { IBrochure } from '@/types/brochure.types';
import { ITemplateImage, ITemplateLayout, TemplateType } from '@/types/template.types';
import { getImageExtension } from '@/utils/extension';
import { copyS3Object, deleteS3Objects, uploadBase64ToS3, uploadFileToS3 } from '@/utils/s3';
import { getNow } from '@/utils';
import { convertSvgToPdf, convertSvgToPdfBlob, convertSvgToPng } from '@/utils/svg';
import { IRoom, RoomType } from '@/types/room.types';
import { IMessage, IMsgAttachment, MsgAttLinkedFromType, ServerMessageType } from '@/types/message.types';
import { IContact } from '@/types/contact.types';
import { IUser } from '@/types/user.types';
import { io } from '@/socketServer';
import { sendPush } from '@/utils/onesignal';

const usersCol = db.collection<WithoutId<IUser>>('users');
const brochuresCol = db.collection<WithoutId<IBrochure>>('brochures');
const listingsCol = db.collection('mlsListings');
const templateLayoutsCol = db.collection<WithoutId<ITemplateLayout>>('templateLayouts');
const templateImagesCol = db.collection<WithoutId<ITemplateImage>>('templateImages');
const contactsCol = db.collection<WithoutId<IContact>>('contacts');
const roomsCol = db.collection<WithoutId<IRoom>>('rooms');
const messagesCol = db.collection<WithoutId<IMessage>>('messages');
const msgAttachmentsCol = db.collection<WithoutId<IMsgAttachment>>('msgAttachments');

// brochures
export const createBrochure = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;

    const { name, propertyId, layoutId, data, type = TemplateType.social } = req.body;
    if (!name || !data) {
      return res.status(400).json({ msg: 'Invalid request' });
    }

    const property = await listingsCol.findOne({ _id: new ObjectId(propertyId) });
    if (!property) {
      return res.status(404).json({ msg: 'not found property' });
    }

    const layout = await templateLayoutsCol.findOne({ _id: new ObjectId(layoutId) });
    if (!layout) {
      return res.status(404).json({ msg: 'not found layout' });
    }

    const brochureData: WithoutId<IBrochure> = {
      orgId: agent.orgId,
      name,
      creator: agent.username,
      propertyId: property._id,
      property,
      layoutId: layout._id,
      layout,
      type,
      createdAt: getNow(),
      data,
      edited: true,
    };

    const newBrochure = await brochuresCol.insertOne(brochureData);

    return res.json({ ...brochureData, _id: newBrochure.insertedId });
  } catch (error) {
    console.log('createBrochure ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getBrochures = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;

    const brochures = await brochuresCol.find({ orgId: agent.orgId, creator: agent.username }).toArray();

    return res.json(brochures);
  } catch (error) {
    console.log('getBrochures ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getBrochure = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;

    const { brochureId } = req.params;

    const brochure = await brochuresCol.findOne({
      _id: new ObjectId(brochureId),
      orgId: agent.orgId,
      creator: agent.username,
    });

    if (!brochure) {
      return res.status(404).json({ msg: 'not found brochure' });
    }

    return res.json(brochure);
  } catch (error) {
    console.log('getBrochure ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const updateBrochure = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;
    const { brochureId } = req.params;
    const { name, data } = req.body;

    if (!name || !data) {
      return res.status(400).json({ msg: 'Invalid request' });
    }

    const brochure = await brochuresCol.findOne({
      _id: new ObjectId(brochureId),
      orgId: agent.orgId,
      creator: agent.username,
    });

    if (!brochure) {
      return res.status(404).json({ msg: 'not found brochure' });
    }

    const updateData: Partial<IBrochure> = {
      name,
      data,
      edited: true,
    };

    await brochuresCol.updateOne({ _id: brochure._id }, { $set: updateData });

    return res.json({ ...brochure, ...updateData });
  } catch (error) {
    console.log('updateBrochure ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const deleteBrochure = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;
    const { brochureId } = req.params;

    const brochure = await brochuresCol.findOne({
      _id: new ObjectId(brochureId),
      orgId: agent.orgId,
      creator: agent.username,
    });

    if (!brochure) {
      return res.status(404).json({ msg: 'not found brochure' });
    }
    await brochuresCol.deleteOne({ _id: brochure._id });

    return res.json({ msg: 'success' });
  } catch (error) {
    console.log('deleteBrochure ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

// Brochure images
export const uploadBrochureImage = async (req: Request, res: Response) => {
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
      'orgs/template-images',
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

    const newImage = await templateImagesCol.insertOne(data);

    return res.json({ ...data, _id: newImage.insertedId });
  } catch (error) {
    console.log('uploadBrochureImage ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const getBrochureImages = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;

    const images = await templateImagesCol.find({ orgId: agent.orgId }).toArray();

    return res.json(images);
  } catch (error) {
    console.log('getBrochureImages ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const deleteBrochureImage = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;
    const { imageId } = req.params;

    const image = await templateImagesCol.findOne({ _id: new ObjectId(imageId), orgId: agent.orgId });
    if (!image) {
      return res.status(404).json({ msg: 'Not found template' });
    }

    await templateImagesCol.deleteOne({ _id: image._id });

    await deleteS3Objects([image.s3Key]);

    return res.json({ msg: 'success' });
  } catch (error) {
    console.log('deleteBrochureImage ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const downloadPDFForBrochure = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;

    const { brochureId } = req.params;

    const brochure = await brochuresCol.findOne({
      _id: new ObjectId(brochureId),
      orgId: agent.orgId,
      creator: agent.username,
      type: TemplateType.brochure,
    });

    if (!brochure) {
      return res.status(404).json({ msg: 'not found brochure' });
    }

    let { svgs = [] } = req.body;
    if (svgs.length === 0) {
      return res.status(400).json({ msg: 'svg data required!' });
    }

    const doc = await convertSvgToPdf(svgs, brochure.layout);

    res.setHeader('Content-Type', 'application/pdf');

    doc.pipe(res);
  } catch (error) {
    console.log('downloadPDFForBrochure ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const downloadPngForSocial = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;

    const { brochureId } = req.params;

    const social = await brochuresCol.findOne({
      _id: new ObjectId(brochureId),
      orgId: agent.orgId,
      creator: agent.username,
      type: TemplateType.social,
    });

    if (!social) {
      return res.status(404).json({ msg: 'not found brochure' });
    }

    let { svg } = req.body;
    if (!svg) {
      return res.status(400).json({ msg: 'svg data required!' });
    }

    const png = await convertSvgToPng(svg, social.layout);

    res.setHeader('Content-Type', 'image/png');

    return res.send(png);
  } catch (error) {
    console.log('downloadPngForSocial ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const copySocialLink = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;

    const { brochureId } = req.params;

    const social = await brochuresCol.findOne({
      _id: new ObjectId(brochureId),
      orgId: agent.orgId,
      creator: agent.username,
      type: TemplateType.social,
    });

    if (!social) {
      return res.status(404).json({ msg: 'not found brochure' });
    }

    if (!social.edited && social.publicLink) {
      return res.json(social);
    }

    let { svg } = req.body;
    if (!svg) {
      return res.status(400).json({ msg: 'svg data required!' });
    }

    const png = await convertSvgToPng(svg, social.layout);

    const { url, s3Key } = await uploadFileToS3('template-files', social.name, png, 'image/png', 'png');

    const updateData: Partial<IBrochure> = {
      edited: false,
      publicLink: url,
      s3Key,
      mimetype: 'image/png',
    };

    await brochuresCol.updateOne({ _id: social._id }, { $set: updateData });

    return res.json({ ...social, ...updateData });
  } catch (error) {
    console.log('copySocialLink ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const copyBrochureLink = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;

    const { brochureId } = req.params;

    const brochure = await brochuresCol.findOne({
      _id: new ObjectId(brochureId),
      orgId: agent.orgId,
      creator: agent.username,
      type: TemplateType.brochure,
    });

    if (!brochure) {
      return res.status(404).json({ msg: 'not found brochure' });
    }

    if (!brochure.edited && brochure.publicLink) {
      return res.json(brochure);
    }

    let { svgs = [] } = req.body;
    if (svgs.length === 0) {
      return res.status(400).json({ msg: 'svg data required!' });
    }

    const blob = await convertSvgToPdfBlob(svgs, brochure.layout);

    const { url, s3Key } = await uploadFileToS3(
      'template-files',
      brochure.name,
      await blob.arrayBuffer(),
      'application/pdf',
      'pdf'
    );

    const updateData: Partial<IBrochure> = {
      edited: false,
      publicLink: url,
      s3Key,
      mimetype: 'application/pdf',
    };

    await brochuresCol.updateOne({ _id: brochure._id }, { $set: updateData });

    return res.json({ ...brochure, ...updateData });
  } catch (error) {
    console.log('copyBrochureLink ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

const sendMessage = async (
  agent: IAgentProfile,
  room: IRoom,
  brochure: IBrochure,
  contactId?: string,
  msg?: string
) => {
  const attachMentData: WithoutId<IMsgAttachment> = {
    roomId: room._id,
    name: brochure.name,
    url: brochure.publicLink!,
    s3Key: brochure.s3Key!,
    mimetype: brochure.mimetype!,
    size: 0,
    timestamp: getNow(),
    creator: agent.username,
    linkedFrom: MsgAttLinkedFromType.brochure,
  };

  const newAttachment = await msgAttachmentsCol.insertOne(attachMentData);

  // create message
  const msgData: WithoutId<IMessage> = {
    orgId: agent.orgId,
    roomId: room._id,
    msg: msg || `${agent.username} shared a ${brochure.type} template file`,
    senderName: agent.username,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    edited: false,
    editable: !!msg,
    mentions: [],
    channels: [],
    attachmentIds: [newAttachment.insertedId],
  };
  const newMsg = await messagesCol.insertOne(msgData);

  // get all users
  const users = await usersCol.find({ username: { $in: room.usernames } }).toArray();

  // update room
  const roomData: IRoom = {
    ...room,
    userStatus: {
      ...room.userStatus,
      ...room.usernames.reduce((obj, un) => {
        const socketIds = users.find((u) => u.username === un)?.socketIds;
        return {
          ...obj,
          [un]: {
            online: socketIds ? socketIds.length > 0 : false,
            notis: un !== agent.username ? room.userStatus[un].notis + 1 : room.userStatus[un].notis,
            unRead: true,
            firstNotiMessage:
              un !== agent.username
                ? room.userStatus[un].firstNotiMessage || newMsg.insertedId
                : room.userStatus[un].firstNotiMessage,
            firstUnReadmessage: room.userStatus[un].firstUnReadmessage || newMsg.insertedId,
          },
        };
      }, {}),
    },
  };

  if (room.type === RoomType.dm && !room.dmInitiated) {
    roomData.dmInitiated = true;
  }

  await roomsCol.updateOne({ _id: room._id }, { $set: roomData });

  users.forEach((u) => {
    u.socketIds?.forEach((socketId) => {
      if (io) {
        // update room
        io.to(socketId).emit(ServerMessageType.channelUpdate, roomData);

        // send message
        io.to(socketId).emit(ServerMessageType.msgSend, {
          ...msgData,
          _id: newMsg.insertedId,
          attachments: [{ ...attachMentData, _id: newAttachment.insertedId }],
        });
      }
    });
  });

  // send notification
  if (room.type === RoomType.dm && contactId) {
    users
      .filter((u) => u.username !== agent.username)
      .forEach((u) => {
        sendPush({
          name: 'File is shared',
          headings: 'File is shared',
          contents: msg || `${agent.username} shared a ${brochure.type} template file`,
          userId: u.username,
          url: `${process.env.SCHEME_APP}:///?navigateTo=app/contact-orgs/${contactId}/rooms/${room._id}`,
        });

        // send desktop notification
        u.socketIds?.forEach((socketId) => {
          if (io) {
            io.to(socketId).emit(ServerMessageType.electronNotification, {
              title: `File is shared`,
              body: msg || `${agent.username} shared a ${brochure.type} template file`,
              url: `${process.env.WEB_URL}/app/contact-orgs/${contactId}/rooms/${room._id}`,
            });
          }
        });
      });
  }
};

export const shareSocialInChat = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;

    const { brochureId } = req.params;
    let { contactId, channelId, msg } = req.body;

    let room: IRoom | null = null;

    if (contactId) {
      const contact = await contactsCol.findOne({ _id: contactId, orgId: agent.orgId, agentProfileId: agent._id });
      if (!contact) {
        return res.status(404).json({ msg: 'Not found contact' });
      }
      room = await roomsCol.findOne({
        orgId: agent.orgId,
        usernames: {
          $all: [agent.username, contact.username || contact._id.toString()],
        },
        type: RoomType.dm,
        deleted: false,
      });
      if (!room) {
        return res.status(404).json({ msg: 'Not found contact' });
      }
    } else if (channelId) {
      room = await roomsCol.findOne({
        _id: new ObjectId(channelId as string),
        orgId: agent.orgId,
        usernames: agent.username,
        type: RoomType.channel,
        deleted: false,
      });
      if (!room) {
        return res.status(404).json({ msg: 'Not found channel' });
      }
    } else {
      return res.status(400).json({ msg: 'Invalid request' });
    }

    const social = await brochuresCol.findOne({
      _id: new ObjectId(brochureId),
      orgId: agent.orgId,
      creator: agent.username,
      type: TemplateType.social,
    });

    if (!social) {
      return res.status(404).json({ msg: 'not found brochure' });
    }

    if (!social.edited && social.publicLink) {
      await sendMessage(agent, room, social, contactId, msg);
    } else {
      const { svg } = req.body;
      if (!svg) {
        return res.status(400).json({ msg: 'svg data required!' });
      }

      const png = await convertSvgToPng(svg, social.layout);

      const { url, s3Key } = await uploadFileToS3('template-files', social.name, png, 'image/png', 'png');

      const updateData: Partial<IBrochure> = {
        edited: false,
        publicLink: url,
        s3Key,
        mimetype: 'image/png',
      };

      await brochuresCol.updateOne({ _id: social._id }, { $set: updateData });

      await sendMessage(agent, room, { ...social, ...updateData }, contactId, msg);
    }

    return res.json({ msg: 'Shared' });
  } catch (error) {
    console.log('shareSocialInChat ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

export const shareBrochureInChat = async (req: Request, res: Response) => {
  try {
    const agent = req.agentProfile as IAgentProfile;

    const { brochureId } = req.params;

    let { contactId, channelId, msg } = req.body;

    let room: IRoom | null = null;

    if (contactId) {
      const contact = await contactsCol.findOne({ _id: contactId, orgId: agent.orgId, agentProfileId: agent._id });
      if (!contact) {
        return res.status(404).json({ msg: 'Not found contact' });
      }
      room = await roomsCol.findOne({
        orgId: agent.orgId,
        usernames: {
          $all: [agent.username, contact.username || contact._id.toString()],
        },
        type: RoomType.dm,
        deleted: false,
      });
      if (!room) {
        return res.status(404).json({ msg: 'Not found contact' });
      }
    } else if (channelId) {
      room = await roomsCol.findOne({
        _id: new ObjectId(channelId as string),
        orgId: agent.orgId,
        usernames: agent.username,
        type: RoomType.channel,
        deleted: false,
      });
      if (!room) {
        return res.status(404).json({ msg: 'Not found channel' });
      }
    } else {
      return res.status(400).json({ msg: 'Invalid request' });
    }

    const brochure = await brochuresCol.findOne({
      _id: new ObjectId(brochureId),
      orgId: agent.orgId,
      creator: agent.username,
      type: TemplateType.brochure,
    });

    if (!brochure) {
      return res.status(404).json({ msg: 'not found brochure' });
    }

    if (!brochure.edited && brochure.publicLink) {
      await sendMessage(agent, room, brochure, contactId, msg);
    } else {
      let { svgs = [] } = req.body;
      if (svgs.length === 0) {
        return res.status(400).json({ msg: 'svg data required!' });
      }

      const blob = await convertSvgToPdfBlob(svgs, brochure.layout);

      const { url, s3Key } = await uploadFileToS3(
        'template-files',
        brochure.name,
        await blob.arrayBuffer(),
        'application/pdf',
        'pdf'
      );

      const updateData: Partial<IBrochure> = {
        edited: false,
        publicLink: url,
        s3Key,
        mimetype: 'application/pdf',
      };

      await brochuresCol.updateOne({ _id: brochure._id }, { $set: updateData });

      await sendMessage(agent, room, { ...brochure, ...updateData }, contactId, msg);
    }

    return res.json({ msg: 'Shared' });
  } catch (error) {
    console.log('shareBrochureInChat ===>', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};
