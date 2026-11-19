import { connect, type TLSSocket } from "node:tls";

export type HttpsProbeResult = {
  sslOk: boolean;
  isTraefikDefault: boolean;
  detail?: string;
};

function readTraefikDefault(socket: TLSSocket): boolean {
  const cert = socket.getPeerCertificate();
  if (!cert || !cert.subject) return false;
  const subjectCn = String(cert.subject.CN ?? "");
  const issuerCn = String(cert.issuer?.CN ?? "");
  const issuerO = String(cert.issuer?.O ?? "");
  const blob = `${subjectCn} ${issuerCn} ${issuerO}`.toLowerCase();
  return blob.includes("traefik default cert");
}

function tlsProbe(hostname: string, rejectUnauthorized: boolean): Promise<HttpsProbeResult & { connected: boolean }> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: HttpsProbeResult & { connected: boolean }) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const socket = connect(
      {
        host: hostname,
        port: 443,
        servername: hostname,
        rejectUnauthorized,
      },
      () => {
        const isTraefikDefault = readTraefikDefault(socket);
        const sslOk = rejectUnauthorized && !isTraefikDefault;
        socket.end();
        done({
          connected: true,
          sslOk,
          isTraefikDefault,
          detail: isTraefikDefault ? "TRAEFIK DEFAULT CERT" : undefined,
        });
      },
    );
    socket.setTimeout(10_000, () => {
      socket.destroy();
      done({ connected: false, sslOk: false, isTraefikDefault: false, detail: "timeout TLS" });
    });
    socket.on("error", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      done({ connected: false, sslOk: false, isTraefikDefault: false, detail: message });
    });
  });
}

/** Verifica HTTPS com validação TLS (Let's Encrypt) e detecta certificado padrão do Traefik. */
export async function probeHttpsCertificate(hostname: string): Promise<HttpsProbeResult> {
  const strict = await tlsProbe(hostname, true);
  if (strict.sslOk) {
    return { sslOk: true, isTraefikDefault: false };
  }
  if (strict.connected && strict.isTraefikDefault) {
    return { sslOk: false, isTraefikDefault: true, detail: "TRAEFIK DEFAULT CERT" };
  }

  const loose = await tlsProbe(hostname, false);
  if (loose.connected && loose.isTraefikDefault) {
    return { sslOk: false, isTraefikDefault: true, detail: "TRAEFIK DEFAULT CERT" };
  }

  return {
    sslOk: false,
    isTraefikDefault: loose.isTraefikDefault,
    detail: strict.detail ?? loose.detail ?? "HTTPS indisponível",
  };
}