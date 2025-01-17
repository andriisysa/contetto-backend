import { IAgentProfile } from '@/types/agentProfile.types';
import type { IUser } from './src/types/user.types';
import { ISearchResult } from '@/types/search.types';
import { IContact } from '@/types/contact.types';
import { Socket as OriginalSocket } from 'socket.io';
import { IFolder } from '@/types/folder.types';
import { IOrg } from '@/types/org.types';

declare global {
  namespace Express {
    export interface Request {
      user?: IUser;
      org?: IOrg;
      agentProfile?: IAgentProfile;
      searchResult?: ISearchResult;
      contact?: IContact;
      folder?: IFolder;
    }
  }

  declare type Socket = OriginalSocket & {
    user?: IUser;
  };
}
