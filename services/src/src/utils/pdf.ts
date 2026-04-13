import puppeteer from 'puppeteer';

export async function generatePDF(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 0 }); // 0 = sem limite

  await new Promise(resolve => setTimeout(resolve, 1000));

  const pdfBuffer = Buffer.from(await page.pdf({ format: 'A4', landscape: true, printBackground: true }));
  await browser.close();

  return pdfBuffer;
}
