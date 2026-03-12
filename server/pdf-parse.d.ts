declare module "pdf-parse" {
  interface PDFData {
    text: string;
    numpages: number;
    info: Record<string, any>;
  }
  function pdfParse(buffer: Buffer): Promise<PDFData>;
  export default pdfParse;
}
