
const DB='officinaDB',VER=1;
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,VER);r.onupgradeneeded=e=>{const db=e.target.result;
 if(!db.objectStoreNames.contains('records'))db.createObjectStore('records',{keyPath:'id'});
 if(!db.objectStoreNames.contains('photos'))db.createObjectStore('photos',{keyPath:'id'});};
 r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
async function putRecord(v){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put(v);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
async function getRecord(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction('records','readonly');const q=tx.objectStore('records').get(id);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});}
async function getAllRecords(){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction('records','readonly');const q=tx.objectStore('records').getAll();q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});}
async function deleteRecord(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').delete(id);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
async function savePhotos(id,images){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').put({id,images});tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
async function getPhotos(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction('photos','readonly');const q=tx.objectStore('photos').get(id);q.onsuccess=()=>res(q.result?.images||[]);q.onerror=()=>rej(q.error);});}
