/* Integrasi Firebase + Netlify API — mempertahankan engine tampilan Tukuin asli. */
(() => {
  'use strict';
  // Mengosongkan dummy data yang awalnya hanya hidup di browser.
  Object.assign(state, { currentUser:null,users:[],products:[],orders:[],reports:[],notifications:[],activity:[] });
  const cfg = window.TUKUIN_FIREBASE_CONFIG;
  const configured = cfg && cfg.apiKey && !cfg.apiKey.includes('ISI_') && cfg.projectId && !cfg.projectId.includes('ISI_');
  if (!configured || typeof firebase === 'undefined') {
    window.onload = () => {
      renderChrome();renderCurrentView();
      showToast('Perlu Konfigurasi Firebase','Edit public/firebase-config.js sesuai Project Settings > Your apps di Firebase.','warning');
    };
    return;
  }
  firebase.initializeApp(cfg);
  const auth = firebase.auth();
  const db = firebase.firestore();
  let unsubs=[];
  let publicUsers=[],privateUsers=[],authReady=false,privateMe={};
  let subscriptionsEpoch=0;
  let selectedFile=null;
  let activeChat=null;
  let busy=false;
  function errorToast(error) {
    console.error('Tukuin:',error);
    showToast('Proses gagal',error?.message || 'Periksa console browser dan Firebase Rules.','error');
  }
  function ui() {
    if (!authReady) return;
    const currentId=auth.currentUser?.uid;
    state.users=publicUsers.map(u=>({ ...(state.currentUser?.id===u.id ? state.currentUser : {}), ...u, ...(privateUsers.find(p=>p.id===u.id)||{}), ...(u.id===currentId ? privateMe : {}) }));
    // Detail privat pengguna lain hanya dibutuhkan pada dashboard admin.
    if(state.currentUser) {
      const latest=state.users.find(u=>u.id===state.currentUser.id);
      if(latest) state.currentUser={ ...latest, ...privateMe };
    }
    renderChrome();renderCurrentView();
    if(activeChat && !document.getElementById('chat-modal').classList.contains('hidden') && state.orders.some(o=>o.id===activeChat)) {
      // Jangan refresh modal ketika pengguna sedang mengetik.
      if(document.activeElement?.id !== 'chat-message-input') openOrderChatModal(activeChat);
    }
  }
  async function api(action,data={}) {
    const user=auth.currentUser;
    if(!user) throw new Error('Masuk dengan akun Google terlebih dahulu');
    const res=await fetch('/.netlify/functions/api',{
      method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+await user.getIdToken()},
      body:JSON.stringify({action,data})
    });
    const result=await res.json().catch(()=>({error:'Server tidak mengirim JSON'}));
    if(!res.ok)throw new Error(result.error || `HTTP ${res.status}`);
    return result;
  }
  async function execute(action,data={},message='Perubahan berhasil disimpan') {
    if(busy) return null;
    busy=true;
    try { const result=await api(action,data);if(message)showToast('Berhasil',message,'success');return result; }
    catch(error){errorToast(error);return null;}
    finally{busy=false;}
  }
  function listen(query,handler) {
    const epoch=subscriptionsEpoch;
    const off=query.onSnapshot(snap=>{if(epoch!==subscriptionsEpoch)return;handler(snap);ui();},error=>errorToast(error));
    unsubs.push(off);
  }
  function allDocs(snapshot) {return snapshot.docs.map(x=>({id:x.id,...x.data()}));}
  function stopListeners(){++subscriptionsEpoch;unsubs.forEach(f=>f());unsubs=[];}
  // Katalog publik bisa dipantau juga sebelum login.
  listen(db.collection('products'), snap=> {state.products=allDocs(snap).sort((a,b)=>b.createdAt-a.createdAt);});
  listen(db.collection('users'), snap=>{publicUsers=allDocs(snap);ui();});
  function startPrivateListeners(uid,role) {
    let myOrders=[],mySales=[];
    const recombine=()=>{const map=new Map([...myOrders,...mySales].map(x=>[x.id,x]));state.orders=[...map.values()].sort((a,b)=>b.createdAt-a.createdAt);};
    if(role==='admin') {
      listen(db.collection('orders'),snap=>{state.orders=allDocs(snap).sort((a,b)=>b.createdAt-a.createdAt);});
      listen(db.collection('reports'),snap=>{state.reports=allDocs(snap);});
      listen(db.collection('activity'),snap=>{state.activity=allDocs(snap).sort((a,b)=>b.createdAt-a.createdAt);});
      listen(db.collection('privateUsers'),snap=>{privateUsers=allDocs(snap); // hanya untuk admin
        ui();});
    } else {
      listen(db.collection('orders').where('buyerId','==',uid),snap=>{myOrders=allDocs(snap);recombine();});
      listen(db.collection('orders').where('sellerId','==',uid),snap=>{mySales=allDocs(snap);recombine();});
      listen(db.collection('reports').where('reporterId','==',uid),snap=>{state.reports=allDocs(snap);});
    }
    listen(db.collection('notifications').where('userId','==',uid),snap=>{state.notifications=allDocs(snap).sort((a,b)=>b.createdAt-a.createdAt);});
    listen(db.collection('privateUsers').doc(uid),snap=>{privateMe=snap.data()||{};ui();});
  }
  auth.onAuthStateChanged(async user=>{
    stopListeners();authReady=false;
    // listener publik harus dipasang ulang setelah logout atau pergantian akun.
    listen(db.collection('products'),snap=>{state.products=allDocs(snap).sort((a,b)=>b.createdAt-a.createdAt);});
    listen(db.collection('users'),snap=>{publicUsers=allDocs(snap);});
    state.currentUser=null;state.orders=[];state.notifications=[];state.reports=[];state.activity=[];privateMe={};privateUsers=[];
    if(!user){authReady=true;ui();return;}
    try {
      const {user:profile}=await api('register');
      state.currentUser=profile;privateMe={wa:profile.wa||'',nim:profile.nim||'',email:profile.email||''};
      state.users=publicUsers.map(u=>({...u,...(u.id===profile.id?privateMe:{})}));
      authReady=true;
      startPrivateListeners(user.uid,profile.role);
      ui();
      closeModal('auth-modal');
      showToast('Login Google Berhasil',`Selamat datang, ${profile.name}`,'success');
      if(pendingProtectedCallback){const fn=pendingProtectedCallback;pendingProtectedCallback=null;fn();}
    }catch(error) {
      errorToast(error);authReady=true;pendingProtectedCallback=null;
      await auth.signOut();
    }
  });
  // Nonaktifkan jalur login simulasi serta verifikasi KTM palsu.
  window.openAuthModal=()=>{openModal('auth-modal');};
  window.switchAuthTab=()=>{};
  window.loginAsDemo=()=>{showToast('Demo Dinonaktifkan','Login melalui Google saja.','warning');};
  window.simulateKtmUpload=()=>{showToast('Scan KTM Simulasi Dinonaktifkan','NIM diisi setelah login Google.','info');};
  window.runKtmAutoScan=()=>window.loginGoogle();
  window.handleManualAuthSubmit=e=>{e.preventDefault();window.loginGoogle();};
  window.loginGoogle=async()=>{
    try{
      const provider=new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({prompt:'select_account'});
      await auth.signInWithPopup(provider);
    }catch(error){errorToast(error);}
  };
  window.logoutUser=async()=>{try{pendingProtectedCallback=null;state.currentView='home';await auth.signOut();showToast('Keluar Berhasil','Akun Google sudah keluar dari Tukuin.','info');}catch(e){errorToast(e);}};
  // Akses moderator tetap divalidasi di server, tidak mengandalkan tombol UI.
  window.toggleWishlist=async(productId,refreshDetailModal=false)=>{
    if(!state.currentUser)return handleProtectedAction(()=>toggleWishlist(productId,refreshDetailModal));
    const add=!(state.currentUser.wishlist||[]).includes(productId);
    if(await execute('wishlist',{productId,add},add?'Ditambahkan ke wishlist':'Dihapus dari wishlist')){
      if(refreshDetailModal)openProductDetail(productId);
    }
  };
  window.openSellModal=(orig=>function(id=null){
    selectedFile=null;orig(id);
    const sampleButton=document.querySelector('[onclick="cycleSampleProductImage()"]');
    if(sampleButton)sampleButton.classList.add('hidden');
  })(window.openSellModal);
  window.handleProductImageUpload=event=>{
    const file=event.target.files?.[0];if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){
      showToast('Foto tidak valid','Gunakan JPG/PNG/WEBP maksimal 5 MB.','error');event.target.value='';return;
    }
    selectedFile=file;
    document.getElementById('sell-photo-preview').src=URL.createObjectURL(file);
  };
  window.cycleSampleProductImage=()=>showToast('Foto asli wajib','Klik Pilih Foto agar file tersimpan di Cloudinary Free.','info');
  window.handleSaveProduct=async event=>{
    event.preventDefault();if(busy)return;
    const id=document.getElementById('sell-product-id').value;
    const old=id?getProductById(id):null;
    if(!selectedFile&&!old){showToast('Foto belum dipilih','Pilih foto asli produk dahulu.','warning');return;}
    busy=true;
    try{
      let image=old?.image||'';
      if(selectedFile){
        // Signature dibuat di Netlify Function, API Secret Cloudinary tidak pernah masuk HTML.
        const {cloudName,apiKey,timestamp,signature,folder,public_id}=await api('uploadSignature');
        const form=new FormData();
        form.append('file',selectedFile);
        form.append('api_key',apiKey);
        form.append('timestamp',String(timestamp));
        form.append('signature',signature);
        form.append('folder',folder);
        form.append('public_id',public_id);
        const response=await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,{method:'POST',body:form});
        const uploaded=await response.json().catch(()=>({}));
        if(!response.ok||!uploaded.secure_url)throw new Error(uploaded.error?.message||'Upload Cloudinary gagal');
        image=uploaded.secure_url;
      }
      await api('saveProduct',{
        id,name:document.getElementById('sell-name').value,category:document.getElementById('sell-category').value,
        condition:document.getElementById('sell-condition').value,price:Number(document.getElementById('sell-price').value),
        cod:document.getElementById('sell-cod').value,wa:document.getElementById('sell-wa').value,
        description:document.getElementById('sell-desc').value,image
      });
      selectedFile=null;closeModal('sell-modal');showToast('Produk Tersimpan','Produk tersimpan di Firestore dan foto di Cloudinary.','success');
    }catch(error){errorToast(error);}finally{busy=false;}
  };
  window.executeDeleteProduct=async id=>{if(await execute('deleteProduct',{id},'Produk berhasil dihapus')){closeModal('action-modal');}};
  window.submitOrderRequest=async productId=>{
    const result=await execute('order',{productId},'Pesanan telah dibuat');
    if(result){closeModal('product-detail-modal');navigateTo('transactions','purchases');}
  };
  window.sendOrderChatMessage=async(event,orderId)=>{
    event.preventDefault();const input=document.getElementById('chat-message-input');const message=input?.value.trim();
    if(!message)return;
    if(await execute('chat',{orderId,text:message},'')){input.value='';}
  };
  window.confirmFixDeal=async orderId=>{await execute('fixDeal',{orderId},'Konfirmasi Fix Deal terkirim');};
  window.executeCompleteOrder=async orderId=>{if(await execute('completeOrder',{orderId},'Transaksi diselesaikan'))closeModal('action-modal');};
  window.executeCancelOrder=async(event,orderId)=>{
    event.preventDefault();const reason=document.getElementById('cancel-reason-select').value;
    if(await execute('cancelOrder',{orderId,reason},'Pesanan dibatalkan'))closeModal('action-modal');
  };
  window.handleUpdateProfile=async event=>{
    event.preventDefault();
    const data={name:document.getElementById('prof-name').value,wa:document.getElementById('prof-wa').value,
      nim:document.getElementById('prof-nim').value,fakultas:document.getElementById('prof-fakultas').value,angkatan:document.getElementById('prof-angkatan').value};
    if(await execute('profile',data,'Profil berhasil disimpan')){
      Object.assign(state.currentUser,data);Object.assign(privateMe,{nim:data.nim,wa:data.wa});ui();
    }
  };
  window.submitReport=async(event,targetType,targetId)=>{
    event.preventDefault();const reason=document.getElementById('report-reason-text').value;
    if(await execute('report',{targetType,targetId,reason},'Laporan dikirim'))closeModal('action-modal');
  };
  window.toggleUserStatus=async uid=>{await execute('toggleUserStatus',{uid},'Status pengguna berubah');};
  window.resolveReport=async(reportId,result)=>{await execute('resolveReport',{reportId,result},'Moderasi laporan tersimpan');};
  window.markAllNotificationsRead=async()=>{await execute('markNotificationsRead',{},'Notifikasi dibaca');};
  window.syncNow=async()=>{
    showToast('Sinkronisasi','Mengirim data Firestore ke Google Sheets ...','info');
    const result=await execute('syncSheets',{},'Google Sheets sudah diperbarui');
    if(result)console.log('Rekap sinkronisasi:',result);
  };
  window.openOrderChatModal=(original=>function(orderId){activeChat=orderId;original(orderId);})(window.openOrderChatModal);
  window.closeModal=(original=>function(id){if(id==='chat-modal')activeChat=null;original(id);})(window.closeModal);
  // Render Chrome masih memakai label lama; teks diganti tanpa menyentuh class/layout.
  window.renderChrome=(original=>function(){
    original();
    const area=document.getElementById('header-user-area');
    if(!state.currentUser&&area){const label=area.querySelector('span');if(label)label.textContent='Masuk Google';}
  })(window.renderChrome);
  // Perbarui state user dari listeners saat login, agar wishlist/admin tetap aktual.
  window.onload=()=>{authReady=true;renderChrome();renderCurrentView();};
})();
