import PDFDcoument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import blobStream from 'blob-stream';
import svg2png from 'svg2png';
import { ITemplateLayout } from '@/types/template.types';

const fetchImage = async (link: string) => {
  const response = await fetch(link);
  const buffer = await response.arrayBuffer();
  const base64Image = Buffer.from(buffer).toString('base64');

  return `data:image/png;base64,${base64Image}`;
};

export const convertSvgToPdf = async (svgs: string[], layout: ITemplateLayout) => {
  const doc = new PDFDcoument({ size: [layout.width, layout.height] });

  for (let i = 0; i < svgs.length; i++) {
    if (i !== 0) doc.addPage();

    let svg = svgs[i];
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
  }

  doc.end();

  return doc;
};

export const convertSvgToPdfBlob = async (svgs: string[], layout: ITemplateLayout): Promise<Blob> => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = await convertSvgToPdf(svgs, layout);
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

export const convertSvgToPng = async (svg: Buffer, layout: ITemplateLayout) => {
  const png = await svg2png(svg, {
    width: layout.width,
    height: layout.height,
  });

  return png;
};
