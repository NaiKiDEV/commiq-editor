// Shared SSL/certificate types — imported by both main process (ipc/ssl.ts) and renderer (SslInspectorPanel.tsx)

export type CertInfo = {
  subject: Record<string, string>;
  issuer: Record<string, string>;
  sans: string[];
  notBefore: string;
  notAfter: string;
  serialNumber: string;
  fingerprint: string;
  signatureAlgorithm: string;
  publicKeyAlgorithm: string;
  keyBits: number;
  isCA: boolean;
  pem: string;
};
