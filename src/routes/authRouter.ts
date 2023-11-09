import express from 'express';
import { confirmEmail, getMe, login, singup, update } from '@/controllers/auth';
import validate from '@/middlewares/validation';
import { authSchema } from '@/schema';
import auth from '@/middlewares/auth';


const authRouter = express.Router();

authRouter
  .post('/signup', validate(authSchema.signup), singup)
  .post('/login', validate(authSchema.login), login)
  .post('/confirm-email', validate(authSchema.confirmEmail), confirmEmail)
  // .post('/update', update)
  .get('/me', auth, getMe);

export default authRouter;
