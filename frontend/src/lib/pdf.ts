import * as pdfjsLib from 'pdfjs-dist';

// Set up the worker for PDF.js using the unpkg CDN
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

export async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  
  // Load the PDF document
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  let fullText = '';
  
  // Iterate through each page
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    // Extract the text items from the page
    // @ts-ignore - The types for TextItem might be missing or incomplete in some versions
    const pageText = textContent.items.map((item) => item.str || '').join(' ');
    
    fullText += pageText + '\n\n';
  }
  
  // Clean up excessive whitespace
  return fullText.replace(/\s+/g, ' ').trim();
}
