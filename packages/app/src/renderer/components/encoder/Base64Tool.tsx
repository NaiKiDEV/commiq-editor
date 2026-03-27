import { EncoderTool } from './EncoderTool';

function encode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary);
}

function decode(input: string): string {
  const binary = atob(input.trim().replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function Base64Tool() {
  return (
    <EncoderTool
      encodeFn={encode}
      decodeFn={decode}
      inputPlaceholder="Paste plain text to encode, or Base64 to decode…"
    />
  );
}
