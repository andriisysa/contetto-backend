import PDFDcoument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import blobStream from 'blob-stream';
import { Resvg } from '@resvg/resvg-js';
import { ITemplateLayout } from '@/types/template.types';

const fetchImageAsBase64 = async (link: string) => {
  const response = await fetch(link);
  const buffer = await response.arrayBuffer();
  const base64Image = Buffer.from(buffer).toString('base64');

  return `data:image/png;base64,${base64Image}`;
};

const fetchImageAsBuffer = async (link: string) => {
  const response = await fetch(link);
  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer);
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
      const imageData = await fetchImageAsBase64(imageUrl);
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

export const convertSvgToPng = async (svg: Buffer, layout: ITemplateLayout): Promise<Buffer> => {
  const resvg = new Resvg(svg, {
    // font: {
    //   loadSystemFonts: false,
    //   fontDirs: ['../fonts/roboto']
    // },
    fitTo: {
      mode: 'width',
      value: layout.width,
    },
  });
  const hrefs = resvg.imagesToResolve();
  for (const href of hrefs) {
    resvg.resolveImage(href, await fetchImageAsBuffer(href));
  }
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  return pngBuffer;
};
