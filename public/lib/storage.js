(function(root){
  "use strict";
  const KINDS=["state","courses","assignments","submissions","rubrics","events"];
  class MemoryStore{
    constructor(){this.data=new Map(KINDS.map(k=>[k,new Map()]));this.listeners=new Set();this.persistent=false;}
    map(kind){if(!this.data.has(kind))this.data.set(kind,new Map());return this.data.get(kind);}
    async getAll(kind){return [...this.map(kind).values()].map(value=>structuredClone(value));}
    async get(kind,id){const value=this.map(kind).get(id);return value===undefined?null:structuredClone(value);}
    async put(kind,obj){if(!obj||obj.id===undefined)throw Error("Stored records need an id.");this.map(kind).set(obj.id,structuredClone(obj));this.emit(kind,obj.id);return obj;}
    async putMany(kind,items){for(const item of items)await this.put(kind,item);return items;}
    async replaceAll(kind,items){const map=this.map(kind);map.clear();(items||[]).forEach(item=>map.set(item.id,structuredClone(item)));this.emit(kind,"*");return items;}
    async delete(kind,id){this.map(kind).delete(id);this.emit(kind,id);}
    async query(kind,{index,value}={}){return (await this.getAll(kind)).filter(x=>x[index]===value);}
    async transaction(fn){return fn(this);}
    async exportAll(){const out={};for(const kind of this.data.keys())out[kind]=await this.getAll(kind);return out;}
    async importAll(dump,{merge=true}={}){if(!merge)await this.wipe();for(const [kind,items] of Object.entries(dump||{}))if(Array.isArray(items))await this.putMany(kind,items);}
    async wipe(){for(const map of this.data.values())map.clear();this.emit("*","*");}
    onChange(callback){this.listeners.add(callback);return()=>this.listeners.delete(callback);}
    emit(kind,id){this.listeners.forEach(fn=>fn({kind,id}));}
    close(){}
  }
  class IndexedDBStore extends MemoryStore{
    constructor(db){super();this.db=db;this.persistent=true;}
    static open(indexedDB=root.indexedDB,name="talkgrade-studio",version=1){
      if(!indexedDB)return Promise.resolve(new MemoryStore());
      return new Promise(resolve=>{let request;try{request=indexedDB.open(name,version);}catch(_){resolve(new MemoryStore());return;}
        request.onupgradeneeded=()=>{const db=request.result;KINDS.forEach(kind=>{if(!db.objectStoreNames.contains(kind)){const store=db.createObjectStore(kind,{keyPath:"id"});if(kind!=="state"){store.createIndex("courseId","courseId",{unique:false});store.createIndex("assignmentId","assignmentId",{unique:false});}}});};
        request.onsuccess=()=>resolve(new IndexedDBStore(request.result));request.onerror=()=>resolve(new MemoryStore());request.onblocked=()=>resolve(new MemoryStore());
      });
    }
    request(kind,method,value){return new Promise((resolve,reject)=>{let tx;try{tx=this.db.transaction(kind,method==="get"||method==="getAll"?"readonly":"readwrite");const store=tx.objectStore(kind),req=method==="get"?store.get(value):method==="getAll"?store.getAll():method==="delete"?store.delete(value):store.put(value);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||tx.error||Error("IndexedDB request failed."));tx.onabort=()=>reject(tx.error||Error("IndexedDB transaction aborted."));}catch(error){reject(error);}});}
    async getAll(kind){return this.request(kind,"getAll").then(x=>x||[]);}
    async get(kind,id){return this.request(kind,"get",id).then(x=>x===undefined?null:x);}
    async put(kind,obj){if(!obj||obj.id===undefined)throw Error("Stored records need an id.");await this.request(kind,"put",structuredClone(obj));this.emit(kind,obj.id);return obj;}
    async putMany(kind,items){await new Promise((resolve,reject)=>{const tx=this.db.transaction(kind,"readwrite"),store=tx.objectStore(kind);(items||[]).forEach(x=>store.put(structuredClone(x)));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error("IndexedDB transaction aborted."));});this.emit(kind,"*");return items;}
    async replaceAll(kind,items){await new Promise((resolve,reject)=>{const tx=this.db.transaction(kind,"readwrite"),store=tx.objectStore(kind);store.clear();(items||[]).forEach(x=>store.put(structuredClone(x)));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error("IndexedDB transaction aborted."));});this.emit(kind,"*");return items;}
    async delete(kind,id){await this.request(kind,"delete",id);this.emit(kind,id);}
    async query(kind,{index,value}={}){return new Promise((resolve,reject)=>{const tx=this.db.transaction(kind,"readonly"),store=tx.objectStore(kind);if(!store.indexNames.contains(index)){this.getAll(kind).then(rows=>resolve(rows.filter(x=>x[index]===value)),reject);return;}const req=store.index(index).getAll(value);req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);});}
    async transaction(fn){const tx=this.db.transaction(KINDS,"readwrite"),api={get:(kind,id)=>tx.objectStore(kind).get(id),put:(kind,obj)=>tx.objectStore(kind).put(obj),delete:(kind,id)=>tx.objectStore(kind).delete(id)};const result=fn(api);await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error("IndexedDB transaction aborted."));});return result;}
    async exportAll(){const out={};for(const kind of KINDS)out[kind]=await this.getAll(kind);return out;}
    async importAll(dump,{merge=true}={}){if(!merge)await this.wipe();for(const kind of KINDS)if(Array.isArray(dump?.[kind]))await this.putMany(kind,dump[kind]);}
    async wipe(){await Promise.all(KINDS.map(kind=>new Promise((resolve,reject)=>{const tx=this.db.transaction(kind,"readwrite");tx.objectStore(kind).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);})));this.emit("*","*");}
    close(){this.db.close();}
  }
  const api={open:IndexedDBStore.open.bind(IndexedDBStore),MemoryStore,IndexedDBStore,KINDS};root.TG_store=api;if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
