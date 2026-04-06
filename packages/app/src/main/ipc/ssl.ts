import { ipcMain } from 'electron';
import * as tls from 'node:tls';
import * as crypto from 'node:crypto';
import type { CertInfo } from '../../shared/ssl-types';

export type { CertInfo };

function parseDN(dn: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!dn) return result;

  // Split on ", " but not inside quotes
  const parts = dn.split(/,\s*(?=[A-Z]+=)/);
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx > 0) {
      const key = part.slice(0, eqIdx).trim();
      const value = part.slice(eqIdx + 1).trim();
      result[key] = value;
    }
  }
  return result;
}

function getKeyBits(cert: crypto.X509Certificate): number {
  try {
    const keyObj = cert.publicKey;
    const detail = keyObj.asymmetricKeyDetails;
    if (detail?.modulusLength) return detail.modulusLength;
    if (detail?.namedCurve) {
      const curveBits: Record<string, number> = {
        'prime256v1': 256,
        'secp384r1': 384,
        'secp521r1': 521,
      };
      return curveBits[detail.namedCurve] ?? 0;
    }
  } catch {
    // ignore
  }
  return 0;
}

function certToInfo(cert: crypto.X509Certificate): CertInfo {
  const sans: string[] = [];
  if (cert.subjectAltName) {
    // Format: "DNS:example.com, DNS:*.example.com, IP Address:1.2.3.4"
    for (const entry of cert.subjectAltName.split(',')) {
      sans.push(entry.trim());
    }
  }

  const keyObj = cert.publicKey;

  return {
    subject: parseDN(cert.subject),
    issuer: parseDN(cert.issuer),
    sans,
    notBefore: new Date(cert.validFrom).toISOString(),
    notAfter: new Date(cert.validTo).toISOString(),
    serialNumber: cert.serialNumber,
    fingerprint: cert.fingerprint256.replace(/:/g, '').toLowerCase(),
    signatureAlgorithm: (cert as unknown as { sigAlgName?: string }).sigAlgName ?? 'unknown',
    publicKeyAlgorithm: keyObj.asymmetricKeyType ?? 'unknown',
    keyBits: getKeyBits(cert),
    isCA: cert.ca,
    pem: cert.toString(),
  };
}

function buildChainFromTls(
  peerCert: tls.DetailedPeerCertificate,
): { chain: CertInfo[]; errors: string[] } {
  const chain: CertInfo[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let current: tls.DetailedPeerCertificate | undefined = peerCert;

  while (current) {
    const fp = current.fingerprint256;
    if (seen.has(fp)) break;
    seen.add(fp);

    try {
      // Convert raw DER buffer to PEM
      const derBuf = current.raw;
      if (!derBuf || !Buffer.isBuffer(derBuf)) {
        errors.push(`Certificate ${chain.length}: missing raw DER data`);
        current = current!.issuerCertificate as tls.DetailedPeerCertificate | undefined;
        continue;
      }
      const pem = `-----BEGIN CERTIFICATE-----\n${derBuf.toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----`;
      const x509 = new crypto.X509Certificate(pem);
      chain.push(certToInfo(x509));
    } catch (err) {
      errors.push(`Certificate ${chain.length}: ${String(err)}`);
    }

    current = current!.issuerCertificate as tls.DetailedPeerCertificate | undefined;
  }

  return { chain, errors };
}

export function registerSslIpc(): void {
  ipcMain.handle(
    'ssl:inspect',
    async (_event, host: string, port: number): Promise<CertInfo[] | { error: string }> => {
      return new Promise((resolve) => {
        try {
          const socket = tls.connect(
            {
              host,
              port,
              rejectUnauthorized: false,
              servername: host,
              timeout: 10_000,
            },
            () => {
              try {
                const peerCert = socket.getPeerCertificate(true) as tls.DetailedPeerCertificate;
                if (!peerCert || !peerCert.raw) {
                  socket.destroy();
                  resolve({ error: 'No certificate returned by host' });
                  return;
                }
                const { chain, errors } = buildChainFromTls(peerCert);
                socket.destroy();
                if (chain.length === 0) {
                  resolve({ error: errors.length > 0
                    ? `Failed to parse certificates: ${errors.join('; ')}`
                    : 'No certificates could be parsed from the chain' });
                  return;
                }
                resolve(chain);
              } catch (err) {
                socket.destroy();
                resolve({ error: String(err) });
              }
            },
          );

          socket.on('error', (err) => {
            resolve({ error: `Connection failed: ${err.message}` });
          });

          socket.on('timeout', () => {
            socket.destroy();
            resolve({ error: 'Connection timed out' });
          });
        } catch (err) {
          resolve({ error: String(err) });
        }
      });
    },
  );

  ipcMain.handle(
    'ssl:decode-pem',
    async (_event, pem: string): Promise<CertInfo[] | { error: string }> => {
      try {
        // Normalise: if it looks like raw base64 (DER), wrap in PEM header
        let input = pem.trim();
        if (!input.startsWith('-----BEGIN')) {
          input = `-----BEGIN CERTIFICATE-----\n${input}\n-----END CERTIFICATE-----`;
        }

        // There may be multiple PEM blocks concatenated
        const pemBlocks = input.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
        if (!pemBlocks || pemBlocks.length === 0) {
          return { error: 'No valid PEM certificate blocks found' };
        }

        const results: CertInfo[] = [];
        for (const block of pemBlocks) {
          const x509 = new crypto.X509Certificate(block);
          results.push(certToInfo(x509));
        }
        return results;
      } catch (err) {
        return { error: String(err) };
      }
    },
  );

  ipcMain.handle(
    'ssl:generate-self-signed',
    async (
      _event,
      opts: { commonName: string; sans: string[]; days: number; keyAlgorithm: 'rsa' | 'ec' },
    ): Promise<{ cert: string; key: string } | { error: string }> => {
      try {
        const { commonName, sans, days, keyAlgorithm } = opts;

        let keyPair: { publicKey: string; privateKey: string };
        if (keyAlgorithm === 'ec') {
          const pair = crypto.generateKeyPairSync('ec', {
            namedCurve: 'prime256v1',
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
          });
          keyPair = pair;
        } else {
          const pair = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
          });
          keyPair = pair;
        }

        const sanEntries: Array<{ type: number; value: string }> = [];
        for (const san of sans) {
          // IP addresses use type 7, DNS names use type 2
          if (/^\d{1,3}(\.\d{1,3}){3}$/.test(san) || san.includes(':')) {
            sanEntries.push({ type: 7, value: san });
          } else {
            sanEntries.push({ type: 2, value: san });
          }
        }
        // Always include CN as a SAN
        if (!sans.includes(commonName)) {
          if (/^\d{1,3}(\.\d{1,3}){3}$/.test(commonName) || commonName.includes(':')) {
            sanEntries.push({ type: 7, value: commonName });
          } else {
            sanEntries.push({ type: 2, value: commonName });
          }
        }

        // Use openssl subprocess for broad compatibility
        const { execSync } = await import('node:child_process');
        const os = await import('node:os');
        const fs = await import('node:fs');
        const path = await import('node:path');

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'commiq-ssl-'));
        const keyFile = path.join(tmpDir, 'key.pem');
        const certFile = path.join(tmpDir, 'cert.pem');
        const cnfFile = path.join(tmpDir, 'openssl.cnf');

        fs.writeFileSync(keyFile, keyPair.privateKey);

        const sanLines = sanEntries.map((s, i) => {
          if (s.type === 7) return `IP.${i} = ${s.value}`;
          return `DNS.${i} = ${s.value}`;
        });

        const cnfContent = [
          '[req]',
          'distinguished_name = req_dn',
          'x509_extensions = v3_ext',
          'prompt = no',
          '',
          '[req_dn]',
          `CN = ${commonName}`,
          '',
          '[v3_ext]',
          'basicConstraints = CA:FALSE',
          'keyUsage = digitalSignature, keyEncipherment',
          'extendedKeyUsage = serverAuth, clientAuth',
          ...(sanLines.length > 0
            ? ['subjectAltName = @alt_names', '', '[alt_names]', ...sanLines]
            : []),
        ].join('\n');

        fs.writeFileSync(cnfFile, cnfContent);

        execSync(
          `openssl req -new -x509 -key "${keyFile}" -out "${certFile}" -days ${days} -config "${cnfFile}"`,
          { timeout: 15_000 },
        );

        const certPem = fs.readFileSync(certFile, 'utf-8');
        const keyPem = keyPair.privateKey;

        try {
          fs.rmSync(tmpDir, { recursive: true });
        } catch { /* ignore */ }

        return { cert: certPem, key: keyPem };
      } catch (err) {
        return { error: String(err) };
      }
    },
  );
}
