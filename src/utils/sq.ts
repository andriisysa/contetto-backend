export enum AreaUnit {
  sqm = 'square meters',
  sqft = 'square feet',
  acres = 'acres',
  hectares = 'hectares',
}

export const sqftToSqm = (sqft: number) => {
  return sqft * 0.092903;
};

export const sqftToAcres = (sqft: number) => {
  return sqft / 43560;
};

export const acresToSqft = (acres: number) => {
  return acres * 43560;
};

export const acresToSqm = (acres: number) => {
  return acres * 4046.86;
};

export const acresToHectares = (acres: number) => {
  return acres * 0.404686;
};

/**
 * BuildingAreaTotal
 * BuildingAreaUnits: square meters, acres, square feet
 *
 * LotSizeArea
 * LotSizeUnits: acres, square meters, hectares, square feet
 */
