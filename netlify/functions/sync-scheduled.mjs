import { syncSheets } from '../../server/shared.mjs';
export default async () => {
  try { const result = await syncSheets(); console.log('Sync Tukuin berhasil:',result); }
  catch(error) { console.error('Sync Tukuin gagal:',error); throw error; }
};
export const config = { schedule: '*/15 * * * *' };
