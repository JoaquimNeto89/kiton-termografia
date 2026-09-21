// ─── Sincronização com Google Drive ────────────────────────────────────────
// Fluxo 100% client-side (sem backend): usa o Google Identity Services (GIS)
// para obter um access token via OAuth, restrito ao escopo drive.file (o app
// só enxerga arquivos que ele mesmo cria, nunca o Drive inteiro do usuário).
// O arquivo de dados fica salvo no Drive do usuário com nome fixo; achamos
// ele por nome em vez de guardar o ID cru, então funciona mesmo na primeira
// vez em um dispositivo novo.

export const DRIVE_CLIENT_ID = "559691946819-2cbabs7k9dk4mla81idqf8cipvol4ocl.apps.googleusercontent.com";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const DRIVE_FILENAME = "kiton-termografia-dados.json";

let tokenClient = null;
let currentToken = null; // { access_token, expires_at }

function ensureTokenClient() {
  if (tokenClient) return tokenClient;
  if (!window.google?.accounts?.oauth2) {
    throw new Error("Biblioteca do Google ainda não carregou. Aguarde alguns segundos e tente de novo.");
  }
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: DRIVE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: () => {}, // sobrescrito a cada chamada em requestAccessToken()
  });
  return tokenClient;
}

function isTokenValid() {
  return !!(currentToken && currentToken.expires_at > Date.now() + 30000);
}

export function requestAccessToken() {
  if (isTokenValid()) return Promise.resolve(currentToken.access_token);
  const client = ensureTokenClient();
  return new Promise((resolve, reject) => {
    client.callback = resp => {
      if (resp.error) { reject(new Error(resp.error)); return; }
      currentToken = { access_token: resp.access_token, expires_at: Date.now() + (resp.expires_in * 1000) };
      resolve(currentToken.access_token);
    };
    client.error_callback = err => reject(new Error(err?.message || "Login com Google cancelado ou falhou."));
    client.requestAccessToken({ prompt: "" });
  });
}

async function authedFetch(url, opts = {}) {
  let token = await requestAccessToken();
  let res = await fetch(url, { ...opts, headers: { ...opts.headers, Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    currentToken = null;
    token = await requestAccessToken();
    res = await fetch(url, { ...opts, headers: { ...opts.headers, Authorization: `Bearer ${token}` } });
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Drive API ${res.status}: ${body.slice(0,300)}`);
  }
  return res;
}

// Acha o arquivo de dados pelo nome; cria (vazio) se ainda não existir.
export async function findOrCreateFile() {
  const q = encodeURIComponent(`name='${DRIVE_FILENAME}' and trashed=false`);
  const listRes = await authedFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`);
  const { files } = await listRes.json();
  if (files && files[0]) return files[0].id;

  const metadata = { name: DRIVE_FILENAME, mimeType: "application/json" };
  const initial = { relatorios: [], cadastros: { clientes: [], instrumentos: [], tecnicos: [] } };
  const boundary = "kiton_" + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(initial)}\r\n` +
    `--${boundary}--`;
  const createRes = await authedFetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body }
  );
  const created = await createRes.json();
  return created.id;
}

export async function getFileMeta(fileId) {
  const res = await authedFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=modifiedTime,name`);
  return res.json();
}

export async function downloadFile(fileId) {
  const res = await authedFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  return res.json();
}

export async function uploadFile(fileId, dataObj) {
  await authedFetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dataObj) }
  );
}
