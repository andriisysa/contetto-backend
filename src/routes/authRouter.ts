import express from 'express';
import {
  confirmEmail,
  deleteAccount,
  forgotPassword,
  forgotPasswordConfirm,
  forgotUsername,
  getMe,
  login,
  resetPassword,
  singup,
  update,
} from '@/controllers/auth';
import validate from '@/middlewares/validation';
import { authSchema } from '@/schema';
import auth from '@/middlewares/auth';

const authRouter = express.Router();

authRouter
  .post('/signup', validate(authSchema.signup), singup)
  .post('/login', validate(authSchema.login), login)
  .post('/confirm-email', validate(authSchema.confirmEmail), confirmEmail)
  .post('/me', auth, update)
  .get('/me', auth, getMe)
  .post('/forgot-password', validate(authSchema.forgotPassword), forgotPassword)
  .post('/forgot-password-confirm', validate(authSchema.forgotPasswordConfirm), forgotPasswordConfirm)
  .post('/reset-password', validate(authSchema.resetPassword), auth, resetPassword)
  .post('/forgot-username', validate(authSchema.forgotPassword), forgotUsername)
  .delete('/delete', auth, deleteAccount);

export default authRouter;
