export const getImageExtension = (imageType: string): string => {
  let imageExtension = '';
  switch (imageType) {
    case 'image/png':
      imageExtension = 'png';
      break;
    case 'image/jpeg':
      imageExtension = 'jpeg';
      break;
    case 'image/gif':
      imageExtension = 'gif';
      break;
    default:
      return '';
  }
  return imageExtension;
};
