import { createHash, randomBytes } from 'node:crypto';
import { requireAuth, clean, fail, json, logAction, syncSheets } from '../../server/shared.mjs';

export default async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'Gunakan POST' }, 405);
  try {
    const { db, uid, email, displayName } = await requireAuth(request);
    let body;
    try { body = await request.json(); } catch { fail('JSON tidak valid'); }
    const { action, data = {} } = body || {};
    const users = db.collection('users');
    const userRef = users.doc(uid);
    const currentSnap = await userRef.get();
    const current = currentSnap.exists ? currentSnap.data() : null;
    if (action === 'register') {
      if (current?.status === 'suspended') fail('Akun sedang ditangguhkan admin', 403);
      const now = Date.now();
      if (!current) {
        await userRef.create({ id: uid, name: clean(displayName, 90), fakultas: 'UB', angkatan: '-', role: 'student', status: 'active', verified: true, wishlist: [], createdAt: now, lastLoginAt: now });
      } else await userRef.update({ lastLoginAt: now });
      const privateRef = db.collection('privateUsers').doc(uid);
      await privateRef.set({ email }, { merge: true });
      await logAction(db, uid, 'LOGIN', email);
      const publicUser = (await userRef.get()).data();
      const privateUser = (await privateRef.get()).data();
      return json({ ok: true, user: { ...publicUser, ...privateUser } });
    }
    if (!current) fail('Data pengguna belum terdaftar; login ulang', 403);
    if (current.status !== 'active') fail('Akun ditangguhkan admin', 403);
    const admin = current.role === 'admin';
    const requireAdmin = () => { if (!admin) fail('Akses khusus owner/admin', 403); };
    const products = db.collection('products');
    const orders = db.collection('orders');
    const notify = async (to, title, message) => db.collection('notifications').add({ userId: to, title: clean(title,100), message: clean(message,240), read: false, time: 'Baru saja', createdAt: Date.now() });
    switch (action) {
      case 'uploadSignature': {
        const cloudName=process.env.CLOUDINARY_CLOUD_NAME;
        const apiKey=process.env.CLOUDINARY_API_KEY;
        const apiSecret=process.env.CLOUDINARY_API_SECRET;
        if(!cloudName||!apiKey||!apiSecret) fail('Cloudinary belum dikonfigurasi di Netlify',500);
        // Tiap pengguna hanya mendapatkan tanda tangan untuk folder miliknya sendiri.
        const folder=`tukuin/${uid}`;
        const public_id='item_'+randomBytes(12).toString('hex');
        const timestamp=Math.floor(Date.now()/1000);
        const stringToSign=`folder=${folder}&public_id=${public_id}&timestamp=${timestamp}${apiSecret}`;
        const signature=createHash('sha1').update(stringToSign).digest('hex');
        return json({ok:true,cloudName,apiKey,folder,public_id,timestamp,signature});
      }
      case 'profile': {
        const name = clean(data.name,90), wa = clean(data.wa,24), nim = clean(data.nim,20);
        const fakultas = clean(data.fakultas,40), angkatan = clean(data.angkatan,10);
        if (!name || !/^08\d{8,13}$/.test(wa)) fail('Nama dan WhatsApp harus valid, format 08xxxxxxxx');
        if (nim && !/^\d{10,16}$/.test(nim)) fail('NIM harus 10-16 digit');
        const update = { name };
        if (fakultas) update.fakultas = fakultas;
        if (angkatan) update.angkatan = angkatan;
        await userRef.update(update);
        await db.collection('privateUsers').doc(uid).set({ wa, ...(nim ? {nim}: {}) },{merge:true});
        await logAction(db,uid,'PROFIL','Data profil diperbarui');
        return json({ok:true});
      }
      case 'wishlist': {
        const id = clean(data.productId,100);
        const ref = products.doc(id);
        if (!(await ref.get()).exists) fail('Produk tidak ditemukan',404);
        const firebaseAdmin = (await import('firebase-admin')).default;
        await userRef.update({ wishlist: data.add ? firebaseAdmin.firestore.FieldValue.arrayUnion(id) : firebaseAdmin.firestore.FieldValue.arrayRemove(id) });
        return json({ok:true});
      }
      case 'saveProduct': {
        const id = clean(data.id,100);
        const name = clean(data.name,130), category = clean(data.category,50), condition = clean(data.condition,40), cod = clean(data.cod,100), description = clean(data.description,1200);
        const wa = clean(data.wa,24), image = String(data.image || '');
        const price = Number(data.price);
        if (!name || !category || !condition || !cod || !description || !Number.isFinite(price) || price < 1000 || price > 1000000000) fail('Data produk wajib lengkap');
        if (!/^08\d{8,13}$/.test(wa)) fail('WhatsApp tidak valid (08xxxxxxxx)');
        const imagePath = (() => {
          try {
            const u=new URL(image);
            const cloud=process.env.CLOUDINARY_CLOUD_NAME;
            if(!cloud || !/^[a-zA-Z0-9_-]+$/.test(cloud))return false;
            const prefix=`/${cloud}/image/upload/`;
            const rest=decodeURIComponent(u.pathname).startsWith(prefix) ? decodeURIComponent(u.pathname).slice(prefix.length) : '';
            const parts=rest.split('/');
            // Format URL upload asli: /cloud/image/upload/v123/tukuin/<uid>/item_<hex>.jpg
            return u.protocol==='https:' && u.hostname==='res.cloudinary.com'
              && /^v[0-9]+$/.test(parts[0]) && parts[1]==='tukuin' && parts[2]===uid
              && /^item_[a-f0-9]{24}\.(jpg|jpeg|png|webp)$/i.test(parts[3]||'') && parts.length===4;
          } catch { return false; }
        })();
        if (!imagePath) fail('Foto harus diunggah lewat form Cloudinary dari akun Anda');
        let ref, previous;
        if (id) {
          ref = products.doc(id); const snap = await ref.get();
          if (!snap.exists) fail('Produk tidak ada',404);
          previous = snap.data();
          if (previous.sellerId !== uid && !admin) fail('Bukan produk Anda',403);
          if (previous.status !== 'AVAILABLE') fail('Produk yang sudah dipesan/terjual tidak bisa diedit');
          await ref.update({name,category,condition,cod,description,price,image});
        } else {
          ref = products.doc();
          await ref.set({id:ref.id,sellerId:uid,name,category,condition,cod,description,price,image,status:'AVAILABLE',featured:false,createdAt:Date.now()});
        }
        await db.collection('productContacts').doc(ref.id).set({wa,sellerId:uid});
        await logAction(db,uid,id?'EDIT_PRODUK':'UPLOAD_PRODUK',name);
        return json({ok:true,id:ref.id});
      }
      case 'deleteProduct': {
        const id = clean(data.id,100), ref = products.doc(id), snap = await ref.get();
        if (!snap.exists) fail('Produk tidak ditemukan',404);
        if (snap.data().sellerId !== uid && !admin) fail('Tidak memiliki izin',403);
        if (snap.data().status === 'RESERVED') fail('Batalkan pesanan aktif sebelum menghapus barang');
        await ref.delete();
        await db.collection('productContacts').doc(id).delete();
        await logAction(db,uid,'HAPUS_PRODUK',id);
        return json({ok:true});
      }
      case 'order': {
        const productId = clean(data.productId,100), ref = products.doc(productId), orderRef = orders.doc();
        const result = await db.runTransaction(async tx => {
          const productSnap = await tx.get(ref);
          if (!productSnap.exists || productSnap.data().status !== 'AVAILABLE') fail('Barang tidak tersedia');
          const p = productSnap.data();
          if (p.sellerId === uid) fail('Tidak dapat membeli barang sendiri');
          const note = `Halo, saya tertarik membeli ${p.name}. Kapan bisa COD di ${p.cod}?`;
          const order = { id:orderRef.id,productId,buyerId:uid,sellerId:p.sellerId,status:'MENUNGGU_KONFIRMASI',buyerFixDeal:false,sellerFixDeal:false,note,cancelReason:'',createdAt:Date.now(),messages:[{senderId:uid,text:note,time:new Date().toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'})}] };
          tx.update(ref,{status:'RESERVED'}); tx.set(orderRef,order);
          return order;
        });
        await Promise.all([notify(result.sellerId,'Pesanan Baru Masuk','Ada pesanan untuk '+productId),notify(uid,'Pesanan Berhasil','Pesanan berhasil dibuat')]);
        await logAction(db,uid,'BELI_PRODUK',productId);
        return json({ok:true,order:result});
      }
      case 'chat': {
        const ref = orders.doc(clean(data.orderId,100));
        const message = clean(data.text,500);
        if (!message) fail('Pesan kosong');
        let other;
        await db.runTransaction(async tx => {
          const s = await tx.get(ref); if (!s.exists) fail('Pesanan tidak ditemukan',404);
          const o=s.data(); if (o.buyerId!==uid && o.sellerId!==uid) fail('Tidak diizinkan',403);
          if (['SELESAI','DIBATALKAN'].includes(o.status)) fail('Transaksi sudah ditutup');
          other = o.buyerId===uid ? o.sellerId : o.buyerId;
          tx.update(ref,{messages:[...(o.messages||[]).slice(-149),{senderId:uid,text:message,time:new Date().toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'})}]});
        });
        await notify(other,'Pesan Chat Baru',message);
        return json({ok:true});
      }
      case 'fixDeal': {
        const ref = orders.doc(clean(data.orderId,100));
        let other, fixed=false;
        await db.runTransaction(async tx => {
          const s=await tx.get(ref); if (!s.exists) fail('Pesanan tidak ditemukan',404);
          const o=s.data(); if (o.buyerId!==uid && o.sellerId!==uid) fail('Tidak diizinkan',403);
          if (['DIBATALKAN','SELESAI'].includes(o.status)) fail('Pesanan sudah ditutup');
          const buyerFixDeal=o.buyerFixDeal || o.buyerId===uid;
          const sellerFixDeal=o.sellerFixDeal || o.sellerId===uid;
          const patch={buyerFixDeal,sellerFixDeal};
          other = o.buyerId===uid?o.sellerId:o.buyerId;
          if (buyerFixDeal && sellerFixDeal) {
            const buyer=await tx.get(db.collection('privateUsers').doc(o.buyerId));
            const seller=await tx.get(db.collection('productContacts').doc(o.productId));
            patch.status='FIX_DEAL';
            patch.buyerWa=buyer.data()?.wa || '';
            patch.sellerWa=seller.data()?.wa || '';
            fixed=true;
          }
          tx.update(ref,patch);
        });
        await notify(other,fixed?'Fix Deal Tercapai':'Konfirmasi Fix Deal',fixed?'Nomor WhatsApp terbuka di pesanan':'Lawan transaksi menunggu konfirmasi Anda');
        await logAction(db,uid,'FIX_DEAL',ref.id);
        return json({ok:true,fixed});
      }
      case 'completeOrder': {
        const ref=orders.doc(clean(data.orderId,100)); let buyer;
        await db.runTransaction(async tx => {
          const s=await tx.get(ref); if (!s.exists) fail('Pesanan tidak ada',404);
          const o=s.data(); if(o.sellerId!==uid) fail('Hanya penjual dapat menyelesaikan pesanan',403);
          if(o.status!=='FIX_DEAL') fail('Pesanan harus Fix Deal terlebih dahulu');
          buyer=o.buyerId;
          tx.update(ref,{status:'SELESAI'});tx.update(products.doc(o.productId),{status:'SOLD'});
        });
        await notify(buyer,'Transaksi Selesai','Penjual menyelesaikan transaksi');
        await logAction(db,uid,'SELESAI_PESANAN',ref.id);
        return json({ok:true});
      }
      case 'cancelOrder': {
        const ref=orders.doc(clean(data.orderId,100));let other;
        const reason=clean(data.reason,180); if(!reason)fail('Alasan wajib diisi');
        await db.runTransaction(async tx => {
          const s=await tx.get(ref);if(!s.exists)fail('Pesanan tidak ada',404);
          const o=s.data();if(o.buyerId!==uid && o.sellerId!==uid)fail('Tidak berwenang',403);
          if(['SELESAI','DIBATALKAN'].includes(o.status))fail('Pesanan sudah ditutup');
          other=o.buyerId===uid?o.sellerId:o.buyerId;
          const productRef=products.doc(o.productId),productSnap=await tx.get(productRef);
          tx.update(ref,{status:'DIBATALKAN',cancelReason:reason});
          if(productSnap.exists && productSnap.data().status==='RESERVED')tx.update(productRef,{status:'AVAILABLE'});
        });
        await notify(other,'Pesanan Dibatalkan',reason);
        await logAction(db,uid,'BATAL_PESANAN',ref.id);
        return json({ok:true});
      }
      case 'report': {
        const reason=clean(data.reason,600),targetId=clean(data.targetId,100),targetType=clean(data.targetType,25);
        if(!reason||!targetId||!['product','user'].includes(targetType))fail('Data laporan tidak lengkap');
        const ref=db.collection('reports').doc();
        await ref.set({id:ref.id,reason,targetId,targetType,reporterId:uid,status:'pending',createdAt:Date.now()});
        await logAction(db,uid,'LAPORAN',targetId);
        return json({ok:true});
      }
      case 'toggleUserStatus': {
        requireAdmin();const target=clean(data.uid,128);
        if(target===uid)fail('Admin tidak boleh menangguhkan diri sendiri');
        const ref=users.doc(target),s=await ref.get();if(!s.exists)fail('Pengguna tidak ditemukan',404);
        const status=s.data().status==='active'?'suspended':'active';
        await ref.update({status});
        await logAction(db,uid,'MODERASI_AKUN',target+' -> '+status);
        return json({ok:true,status});
      }
      case 'resolveReport': {
        requireAdmin();const ref=db.collection('reports').doc(clean(data.reportId,100)),s=await ref.get();if(!s.exists)fail('Laporan tidak ada',404);
        const action=clean(data.result,30);if(!['resolved','dismissed'].includes(action))fail('Status laporan tidak valid');
        await ref.update({status:action});
        if(action==='resolved' && s.data().targetType==='product') {
          await products.doc(s.data().targetId).delete();
          await db.collection('productContacts').doc(s.data().targetId).delete();
        }
        await logAction(db,uid,'MODERASI_LAPORAN',ref.id+' '+action);
        return json({ok:true});
      }
      case 'markNotificationsRead': {
        const docs=await db.collection('notifications').where('userId','==',uid).get();
        const batch=db.batch();docs.docs.filter(d=>!d.data().read).slice(0,400).forEach(d=>batch.update(d.ref,{read:true}));
        await batch.commit();return json({ok:true});
      }
      case 'syncSheets': {
        requireAdmin();const result=await syncSheets();
        return json({ok:true,...result});
      }
      default:fail('Perintah tidak dikenali',404);
    }
  } catch(error) {
    console.error('Tukuin API:',error);
    return json({error:error.status ? error.message : 'Kesalahan server. Periksa Function Logs Netlify.'},error.status||500);
  }
}
