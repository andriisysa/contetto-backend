import express from 'express';
import { confirmEmail, getMe, invite, login, singup, update } from '../controllers/auth';
import auth from '../middlewares/auth';
import validate from '../middlewares/validation';
import { authSchema } from '../schema';

const authRouter = express.Router();

authRouter
  .post('/signup', validate(authSchema.signup), singup)
  .post('/login', validate(authSchema.login), login)
  .post('/confirm-email', validate(authSchema.confirmEmail), confirmEmail)
  .post('/invite', invite)
  // .post('/update', update)
  .get('/me', auth, getMe);

export default authRouter;
