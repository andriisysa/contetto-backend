import { body } from 'express-validator';

export const authSchema = {
  signup: [
    body('username').isString().withMessage('Enter the username'),
    body('email').isString().withMessage('Enter the eamil'),
    body('password').isString().withMessage('Enter the password'),
  ],
  confirmEmail: [
    body('username').isString().withMessage('Enter the username'),
    body('email').isString().withMessage('Enter the eamil'),
    body('verificationCode').isString().withMessage('Enter the verification code'),
  ],
  login: [
    body('username').isString().withMessage('Enter the username'),
    body('password').isString().withMessage('Enter the password'),
  ],
  forgotPassword: [body('email').isString().withMessage('Enter the eamil')],
  forgotPasswordConfirm: [
    body('email').isString().withMessage('Enter the eamil'),
    body('verificationCode').isString().withMessage('Enter the verification code'),
    body('password').isString().withMessage('Enter the password'),
  ],
};

export const orgSchema = {
  create: [body('name').isString().withMessage('Org name is required!')],
  inviteAgent: [
    body('email').isString().withMessage('Enter the eamil'),
    body('role').isString().withMessage('Enter the role'),
  ],
  acceptInvite: [body('code').isString().withMessage('Enter the code')],
  removeMember: [body('username').isString().withMessage('Enter the member username')],
};

export const contactSchema = {
  create: [body('name').isString().withMessage('Contact name is required!')],
  bind: [body('inviteCode').isString().withMessage('inviteCode is required!')],
  search: [body('name').isString().withMessage('Contact name is required!')],
};
