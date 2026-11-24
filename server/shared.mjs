
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { google } from 'googleapis';

export function services() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (
    process.env.FIREBASE_PRIVATE_KEY || ''
  ).replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Environment variable Firebase server belum lengkap'
    );
  }

  const app = getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey
        })
      });

  return {
    db: getFirestore(app),
    auth: getAuth(app),
    projectId,
    clientEmail,
    privateKey
  };
}

export async function requireAuth(request) {
  const match = (request.headers.get('authorization') || '').match(/^Bearer (.+)$/i);
  if (!match) throw Object.assign(new Error('Login Google diperlukan'), { status: 401 });
  const s = services();
  let token;
  try { token = await s.auth.verifyIdToken(match[1], true); }
  catch { throw Object.assign(new Error('Sesi kedaluwarsa. Masuk kembali.'), { status: 401 }); }
  if (!token.email_verified || token.firebase?.sign_in_provider !== 'google.com') {
    throw Object.assign(new Error('Akun harus login dengan Google yang terverifikasi'), { status: 403 });
  }
  const allowed = (process.env.ALLOWED_EMAIL_DOMAINS || 'student.ub.ac.id,ub.ac.id')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const domain = String(token.email || '').toLowerCase().split('@')[1] || '';
  if (!allowed.includes('*') && !allowed.includes(domain)) throw Object.assign(new Error('Gunakan akun Google dari domain yang diizinkan admin. Hubungi pengelola Tukuin.'), { status: 403 });
  return { ...s, uid: token.uid, email: token.email, displayName: token.name || token.email.split('@')[0] };
}

export function clean(value, max = 300) {
  return String(value ?? '').trim().slice(0, max).replace(/[<>&"'`]/g, '');
}
export function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
export async function logAction(db, uid, action, details = '') {
  await db.collection('activity').add({ uid, action, details: clean(details, 250), createdAt: Date.now() });
}
export async function syncSheets() {
  const { db, clientEmail, privateKey } = services();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) fail('GOOGLE_SHEET_ID belum diatur', 500);
  const auth = new google.auth.JWT({ email: clientEmail, key: privateKey, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const sheets = google.sheets({ version: 'v4', auth });
  const tabs = [
    ['Pengguna', 'users', ['UID','Nama','Fakultas','Angkatan','Role','Status','Email','NIM','WhatsApp','Login Terakhir'], d => [d.id,d.name,d.fakultas,d.angkatan,d.role,d.status,d.email,d.nim,d.wa,d.lastLoginAt]],
    ['Produk', 'products', ['ID','UID Penjual','Nama','Kategori','Kondisi','Harga','COD','Status','URL Foto','Tanggal'], d => [d.id,d.sellerId,d.name,d.category,d.condition,d.price,d.cod,d.status,d.image,d.createdAt]],
    ['Pesanan', 'orders', ['ID','Produk ID','Pembeli UID','Penjual UID','Status','Fix Pembeli','Fix Penjual','Tanggal'], d => [d.id,d.productId,d.buyerId,d.sellerId,d.status,d.buyerFixDeal,d.sellerFixDeal,d.createdAt]],
    ['Laporan', 'reports', ['ID','Pelapor UID','Target','Alasan','Status','Tanggal'], d => [d.id,d.reporterId,d.targetId,d.reason,d.status,d.createdAt]],
    ['Aktivitas', 'activity', ['ID','UID','Aktivitas','Keterangan','Waktu'], d => [d.id,d.uid,d.action,d.details,d.createdAt]]
  ];
  const batches = await Promise.all(tabs.map(x => db.collection(x[1]).get()));
  const privateBatch = await db.collection('privateUsers').get();
  const privateMap = new Map(privateBatch.docs.map(d => [d.id,d.data()]));
  const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  const existing = new Set((metadata.data.sheets || []).map(s => s.properties.title));
  const missing = tabs.filter(t => !existing.has(t[0]));
  if (missing.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: missing.map(t => ({ addSheet: { properties: { title: t[0] } } })) } });
  }
  // Semua data diambil terlebih dahulu sebelum clear agar kegagalan database tidak menghapus spreadsheet.
  const safe = x => { if(typeof x === 'number' || typeof x === 'boolean')return x; const str = x === undefined || x === null ? '' : String(x); return /^[=+\-@]/.test(str) ? "'" + str : str; };
  const updates = tabs.map((t, i) => {
    const docs = batches[i].docs.map(d => ({ id: d.id, ...d.data(), ...(t[1] === 'users' ? privateMap.get(d.id) || {} : {}) }));
    const values = [t[2], ...docs.map(row => t[3](row).map(safe))];
    return { range: `'${t[0]}'!A1`, values };
  });
  await Promise.all(tabs.map(t => sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${t[0]}'!A:Z` })));
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'RAW', data: updates } });
  return { total: Object.fromEntries(tabs.map((t,i) => [t[0],batches[i].size])), synchronizedAt: new Date().toISOString() };
}
