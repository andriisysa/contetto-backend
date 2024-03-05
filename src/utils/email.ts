import { ServerClient } from 'postmark';

const client = new ServerClient(String(process.env.POSTMARK_TOKEN));

export const sendEmail = async (
  to: string,
  subject: string,
  textBody?: string,
  htmlBody?: string,
  from: string = 'no-reply@contetto.com'
) => {
  const response = await client.sendEmail({
    From: from,
    To: to,
    Subject: subject,
    TextBody: textBody,
    HtmlBody: htmlBody,
  });

  console.log('email sent ===>', response);

  return response;
};
