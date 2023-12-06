import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import { awsCredentials } from './aws';

export const s3 = new S3Client(awsCredentials);

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

  return filePath;
};
