import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
  PutObjectAclCommand,
  type ObjectCannedACL,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import path from 'path';
import crypto from 'crypto';
import { awsCredentials } from './aws';

export const s3 = new S3Client(awsCredentials);

const SIGNED_EXP = 3600;

export const uploadBase64ToS3 = async (
  folder: string,
  name: string,
  base64: string,
  ContentType: string,
  fileExt: string,
  acl: boolean = true
) => {
  const hash = crypto.createHash('md5').update(new Date().toISOString()).digest('hex');
  const Key = `${folder}/${name.toLowerCase()}_${hash}.${fileExt}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key,
      Body: Buffer.from(base64.replace(/^data:(image|application)\/\w+;base64,/, ''), 'base64'),
      ContentEncoding: 'base64',
      ContentType,
      ...(acl && { ACL: 'public-read' }),
    })
  );

  const filePath = `https://${process.env.AWS_BUCKET_NAME}.s3.${awsCredentials.region}.amazonaws.com/${Key}`;

  return {
    url: filePath,
    s3Key: Key,
  };
};

export const uploadFileToS3 = async (
  folder: string,
  name: string,
  Body: any,
  ContentType: string,
  fileExt: string,
  acl: boolean = true
) => {
  const hash = crypto.createHash('md5').update(new Date().toISOString()).digest('hex');
  const Key = `${folder}/${name.toLowerCase()}_${hash}.${fileExt}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key,
      Body,
      ContentType,
      ...(acl && { ACL: 'public-read' }),
    })
  );

  const filePath = `https://${process.env.AWS_BUCKET_NAME}.s3.${awsCredentials.region}.amazonaws.com/${Key}`;

  return {
    url: filePath,
    s3Key: Key,
  };
};

export const getUploadSignedUrl = async (orgId: string, filename: string, type: string) => {
  const hash = crypto.createHash('md5').update(new Date().toISOString()).digest('hex');
  const parsed = path.parse(filename);
  const Key = `files/${orgId}/${parsed.name.toLowerCase()}_${hash}${parsed.ext}`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key,
    ACL: 'private',
    ContentType: type,
  });

  const singedUrl = await getSignedUrl(s3, command, { expiresIn: SIGNED_EXP });

  return {
    key: Key,
    singedUrl,
  };
};

export const getDownloadSignedUrl = (Key: string) => {
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key,
  });

  return getSignedUrl(s3, command, { expiresIn: SIGNED_EXP });
};

export const getS3Object = async (Key: string) => {
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key,
  });
  const { Body } = await s3.send(command);

  return Body;
};

export const deleteS3Objects = async (keys: string[]) => {
  if (keys.length == 0) return;

  const command = new DeleteObjectsCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Delete: {
      Objects: keys.map((key) => ({ Key: key })),
    },
  });

  await s3.send(command);
};

export const updateACL = async (Key: string, ACL: ObjectCannedACL) => {
  await s3.send(
    new PutObjectAclCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key,
      ACL,
    })
  );

  const publicUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${awsCredentials.region}.amazonaws.com/${Key}`;

  return publicUrl;
};

export const copyS3Object = async (
  sourceKey: string,
  folder: string,
  name: string,
  fileExt: string,
  acl: boolean = true
) => {
  const hash = crypto.createHash('md5').update(new Date().toISOString()).digest('hex');
  const Key = `${folder}/${name.toLowerCase()}_${hash}.${fileExt}`;

  await s3.send(
    new CopyObjectCommand({
      CopySource: sourceKey,
      Bucket: process.env.AWS_BUCKET_NAME,
      Key,
      ACL: acl ? 'public-read' : 'private',
    })
  );

  const url = `https://${process.env.AWS_BUCKET_NAME}.s3.${awsCredentials.region}.amazonaws.com/${Key}`;

  return {
    url,
    s3Key: Key,
  };
};
