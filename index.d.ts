import { IAgentProfile } from '@/types/agentProfile.types';
import type { IUser } from './src/types/user.types';

declare global {
  namespace Express {
    export interface Request {
      user?: IUser;
      agentProfile?: IAgentProfile;
    }
  }
}
