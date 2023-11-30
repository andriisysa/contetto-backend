// file upload
// time check

import { nearestCities, searchCitites } from '@/controllers/citites';
import express from 'express';

const citiesRouter = express.Router();

citiesRouter.get('', searchCitites).get('/nearest', nearestCities);

export default citiesRouter;
