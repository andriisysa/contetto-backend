import PDFDcoument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import blobStream from 'blob-stream';

const fetchImage = async (link: string) => {
  const response = await fetch(link);
  const buffer = await response.arrayBuffer();
  const base64Image = Buffer.from(buffer).toString('base64');

  return `data:image/png;base64,${base64Image}`;
};

export const convertSvgToPdf = async (svg: string) => {
  const doc = new PDFDcoument();

  // Find all image links in the SVG content
  const imageLinks = svg.match(/xlink:href="(.*?)"/g);

  // Use Promise.all to wait for all image fetching promises to resolve
  const imagePromises = (imageLinks || []).map(async (link: string) => {
    const matches = link.match(/xlink:href="([^"]*)"/);
    const imageUrl = matches ? matches[1] : '';
    const imageData = await fetchImage(imageUrl);
    svg = svg.replace(imageUrl, imageData);
  });

  await Promise.all(imagePromises);

  SVGtoPDF(doc, svg, 0, 0, {
    assumePt: true,
  });

  doc.end();

  return doc;
};

export const convertSvgToPdfBlob = async (svg: string): Promise<Blob> => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = await convertSvgToPdf(svg);
      const stream = doc.pipe(blobStream());

      stream.on('finish', function () {
        // get a blob you can do whatever you like with
        const blob = stream.toBlob('application/pdf');

        resolve(blob);
      });
    } catch (error) {
      reject(error);
    }
  });
};
