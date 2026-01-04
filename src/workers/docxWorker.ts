type DocxWorkerRequest =
  | {
      type: 'convert';
      base64Content: string;
    };

type DocxWorkerResponse =
  | { type: 'result'; html: string }
  | { type: 'error'; error: string };

async function convertDocxBase64ToHtml(base64Content: string): Promise<string> {
  const { default: mammoth } = await import('mammoth');

  const binaryString = atob(base64Content);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const result = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer });
  return result.value;
}

self.addEventListener('message', (event: MessageEvent<DocxWorkerRequest>) => {
  const msg = event.data;
  if (!msg || msg.type !== 'convert') return;

  convertDocxBase64ToHtml(msg.base64Content)
    .then((html) => {
      const response: DocxWorkerResponse = { type: 'result', html };
      // eslint-disable-next-line no-restricted-globals
      (self as unknown as Worker).postMessage(response);
    })
    .catch((err) => {
      const response: DocxWorkerResponse = {
        type: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
      // eslint-disable-next-line no-restricted-globals
      (self as unknown as Worker).postMessage(response);
    });
});
