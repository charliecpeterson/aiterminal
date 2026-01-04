type AsciidocWorkerRequest = {
  type: 'convert';
  content: string;
};

type AsciidocWorkerResponse =
  | { type: 'result'; html: string }
  | { type: 'error'; error: string };

async function convertAsciidocToHtml(content: string): Promise<string> {
  const { default: Asciidoctor } = await import('@asciidoctor/core');
  const asciidoctor = Asciidoctor();
  const html = asciidoctor.convert(content, { safe: 'safe' });
  return String(html);
}

self.addEventListener('message', (event: MessageEvent<AsciidocWorkerRequest>) => {
  const msg = event.data;
  if (!msg || msg.type !== 'convert') return;

  convertAsciidocToHtml(msg.content)
    .then((html) => {
      const response: AsciidocWorkerResponse = { type: 'result', html };
      // eslint-disable-next-line no-restricted-globals
      (self as unknown as Worker).postMessage(response);
    })
    .catch((err) => {
      const response: AsciidocWorkerResponse = {
        type: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
      // eslint-disable-next-line no-restricted-globals
      (self as unknown as Worker).postMessage(response);
    });
});
