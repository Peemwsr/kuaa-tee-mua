/* Service worker ของ ก๊วนตีมั่ว : (1) แคชตัวแอปให้เปิดใช้ได้แม้ไม่มีเน็ต (2) รับ Web Push ตอนถึงคิว */
var VERSION = 'v2';
var CACHE = 'kuaa-shell-' + VERSION;
var SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
var NET_WAIT = 3000;   // เน็ตช้ากว่านี้ให้ใช้ของที่แคชไว้ก่อน (สนามสัญญาณแย่)

self.addEventListener('install', function(e){
  // แคชทีละไฟล์ ถ้าไฟล์ไหนไม่มี (เช่น อัปแค่ index.html) ก็ข้ามไป ไม่ให้การติดตั้งล้ม
  e.waitUntil(caches.open(CACHE).then(function(c){
    return Promise.all(SHELL.map(function(u){ return c.add(u).catch(function(){}); }));
  }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){ return k.indexOf('kuaa-shell-') === 0 && k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

function isApp(url){ return /\/$/.test(url.pathname) || /\/index\.html$/.test(url.pathname); }
function isFont(url){ return /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname); }
function put(key, res){
  if(res && (res.ok || res.type === 'opaque')){ var copy = res.clone(); caches.open(CACHE).then(function(c){ c.put(key, copy); }); }
  return res;
}

// หน้าแอป: ลองออนไลน์ก่อน (ได้เวอร์ชันใหม่) แต่ถ้าเน็ตช้า/ไม่มี ใช้ที่แคชไว้ / ไฟล์ประกอบและฟอนต์: ใช้แคชก่อนแล้วอัปเดตเบื้องหลัง
// ไม่ยุ่งกับคำขอไปเซิร์ฟเวอร์อื่น (เช่น Supabase) และคำขอที่ไม่ใช่ GET
self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  var url = new URL(req.url);
  var same = url.origin === self.location.origin;
  if(!same && !isFont(url)) return;
  var isPage = same && (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') > -1);
  if(isPage){
    var key = isApp(url) ? './index.html' : req;   // หน้าอื่น (เช่น vapid-keys.html) ห้ามไปทับหน้าแอปในแคช
    e.respondWith(new Promise(function(resolve){
      var done = false, timer = null;
      var cached = function(){ return caches.match(key).then(function(m){ return m || (isApp(url) ? caches.match('./') : null); }); };
      var net = fetch(req).then(function(res){ put(key, res); return res; });
      net.then(function(res){ if(!done){ done = true; clearTimeout(timer); resolve(res); } },
        function(){ if(done) return; cached().then(function(m){ if(done) return; done = true; clearTimeout(timer); m ? resolve(m) : resolve(Response.error()); }); });
      timer = setTimeout(function(){ if(done) return; cached().then(function(m){ if(m && !done){ done = true; resolve(m); } }); }, NET_WAIT);
    }));
    return;
  }
  e.respondWith(caches.match(req).then(function(hit){
    var net = fetch(req).then(function(res){ return put(req, res); }).catch(function(){ return hit; });
    if(hit){ e.waitUntil(net); return hit; }
    return net;
  }));
});

self.addEventListener('push', function(e){
  var d = {};
  try{ d = e.data ? e.data.json() : {}; }catch(_){ d = {title:'ก๊วนตีมั่ว', body: e.data ? e.data.text() : ''}; }
  var title = d.title || 'ก๊วนตีมั่ว';
  e.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(function(cs){
    var visible = cs.some(function(c){ return c.visibilityState === 'visible'; });
    cs.forEach(function(c){ c.postMessage({type:'push', data:d}); });
    // iOS บังคับให้ทุก push ต้องแสดงการแจ้งเตือน (ไม่งั้นระบบอาจยกเลิกการสมัคร) จึงแสดงเสมอ
    // ถ้าหน้าเว็บเปิดอยู่แล้วให้แสดงแบบเงียบ เพราะหน้าเว็บจะมีเสียง/สั่นของตัวเอง
    return self.registration.showNotification(title, {
      body: d.body || '', tag: d.tag || 'kuaa', renotify: true, silent: visible,
      icon: 'icon-192.png', badge: 'icon-192.png',
      vibrate: d.kind === 'turn' ? [300,120,300,120,500] : [200,100,200],
      data: {url: d.url || './'}
    });
  }));
});

self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(function(cs){
    for(var i=0;i<cs.length;i++){ if('focus' in cs[i]) return cs[i].focus(); }
    return self.clients.openWindow ? self.clients.openWindow(url) : null;
  }));
});
