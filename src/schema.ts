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
    body('verificationCode').isNumeric().withMessage('Enter the verification code'),
  ],
  login: [
    body('username').isString().withMessage('Enter the username'),
    body('password').isString().withMessage('Enter the password'),
  ],
};
