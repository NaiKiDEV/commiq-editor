import { EncoderTool } from './EncoderTool';

export function UrlTool() {
  return (
    <EncoderTool
      encodeFn={(s) => encodeURIComponent(s)}
      decodeFn={(s) => decodeURIComponent(s.trim())}
      inputPlaceholder="Paste a URL or encoded string…"
    />
  );
}
