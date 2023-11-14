import express from 'express';
import {
  confirmEmail,
  forgotPassword,
  forgotPasswordConfirm,
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
  .post('/reset-password', auth, resetPassword);

export default authRouter;
