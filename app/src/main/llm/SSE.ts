const DEFAULT_MAX_BUFFER_CHARS = 64 * 1024;

export async function readSSE(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: any) => void,
  opts: { maxBufferChars?: number } = {},
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const maxBufferChars = opts.maxBufferChars ?? DEFAULT_MAX_BUFFER_CHARS;
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    if (buffer.length > maxBufferChars) {
      buffer = buffer.slice(-maxBufferChars);
    }

    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex !== -1) {
      const chunk = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      const event = parseSSEBlock(chunk);
      if (event) {
        onEvent(event);
      }
      separatorIndex = buffer.indexOf("\n\n");
    }
  }

  const event = parseSSEBlock(buffer);
  if (event) {
    onEvent(event);
  }
}

function parseSSEBlock(block: string): any | null {
  if (!block.trim()) {
    return null;
  }

  const dataParts: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("data:")) {
      dataParts.push(line.slice("data:".length).trimStart());
    }
  }

  if (dataParts.length === 0) {
    return null;
  }

  const data = dataParts.join("\n");
  if (data === "[DONE]") {
    return null;
  }

  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
