import dotenv from 'dotenv';
import axios, { AxiosRequestConfig } from 'axios';

dotenv.config();

interface IPushData {
  name?: string;
  contents: string;
  headings: string;
  subtitle?: string;
  userId: string;
  url?: string;
}

export const sendPush = async ({ name, contents, headings, userId, subtitle, url }: IPushData) => {
  try {
    const options: AxiosRequestConfig = {
      method: 'POST',
      url: 'https://onesignal.com/api/v1/notifications',
      headers: {
        accept: 'application/json',
        Authorization: `Basic ${process.env.ONESIGNAL_APP_KEY}`,
        'content-type': 'application/json',
      },
      data: {
        app_id: process.env.ONESIGNAL_APP_ID,
        name,
        headings: { en: headings },
        contents: { en: contents },
        subtitle: { en: subtitle },
        include_external_user_ids: [userId],
        content_available: true,
        url,
        channel_for_external_user_ids: "push"
      },
    };

    await axios.request(options);
    console.log('push sent to ', userId);
  } catch (error) {
    console.log('send push error ===>', error?.response?.data);
  }
};
