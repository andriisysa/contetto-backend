import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config();

export const client = new MongoClient(process.env.MONGO_URI as string);
export const db = client.db(process.env.MONGO_DB_NAME as string);
