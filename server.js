'use strict';
// ChuletonBet: API de almacenamiento compartido. Render Web Service + PostgreSQL.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL. Configura una base de datos PostgreSQL persistente.');
  process.exit(1);
}
const pool = new Pool({connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 10000});
const PORT = Number(process.env.PORT || 10000);
const ROOT = path.join(__dirname, 'public');
const MAX_BODY = 1024 * 1024;
const freshDatabase = () => ({weeks:{},cash:null,results:{},resultChecks:{}});
const own = (obj,key) => Object.prototype.hasOwnProperty.call(obj,key);
function reply(res,status,data,headers={}){
  const body=JSON.stringify(data);
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers});
  res.end(body);
}
function checkPin(req){
  const actual=process.env.WRITE_PIN;
  if(!actual) return true;
  const supplied=req.headers['x-club-pin'];
  const a=Buffer.from(String(supplied || ''));
  const b=Buffer.from(actual);
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}
async function parseJson(req){
  if(!(req.headers['content-type']||'').toLowerCase().startsWith('application/json')){
    const error=new Error('Se necesita Content-Type: application/json'); error.status=415;throw error;
  }
  let bytes=0; const chunks=[];
  for await (const chunk of req){
    bytes+=chunk.length;
    if(bytes>MAX_BODY){const e=new Error('La petición supera 1 MB');e.status=413;throw e;}
    chunks.push(chunk);
  }
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch(_){const e=new Error('JSON inválido');e.status=400;throw e;}
}
function validateOp(op){
  if(!op||!['set','delete','fixture-upsert','fixture-remove'].includes(op.type)||!Array.isArray(op.path) ||op.path.length<1||op.path.length>9)throw new Error('Operación inválida');
  const p=op.path;
  if(!['weeks','cash','results','resultChecks'].includes(p[0]))throw new Error('Ruta no permitida');
  if(p.some(k=>typeof k!=='string'||k.length<1||k.length>150||['__proto__','prototype','constructor'].includes(k)))throw new Error('Clave no permitida');
  if(p[0]==='weeks'){
    if(p.length<2||!/^\d{4}-\d{2}-\d{2}(\|europa)?$/.test(p[1]) || (p.length===2&&op.type!=='delete') || (p.length>2&&!['submissions','votes','fixed','ticket','fixtures','manualOdds'].includes(p[2])))throw new Error('Ruta de semana inválida');
    if(p[2]==='fixtures' && (op.type==='fixture-upsert'||op.type==='fixture-remove')){
      if(p.length!==3)throw new Error('Ruta de partido inválida');
    }
  }else if(p[0]==='cash'){
    if(p.length>1)throw new Error('Ruta de caja inválida');
  }else if(p.length!==2){throw new Error('Ruta de resultado inválida');}
  if(op.type==='set' && !own(op,'value'))throw new Error('Falta valor');
  if(op.type==='fixture-upsert'){
    if(!op.value||!Number.isSafeInteger(op.value.id)||op.value.id<=0||typeof op.value.home!=='string'||typeof op.value.away!=='string')throw new Error('Partido inválido');
  }
  if(op.type==='fixture-remove' && !Number.isSafeInteger(op.id))throw new Error('ID de partido inválido');
}
function applyOp(db,op){
  validateOp(op);
  const p=op.path;
  let target=db;
  for(let i=0;i<p.length-1;i++){
    const key=p[i];
    if(!own(target,key)||!target[key]||typeof target[key]!=='object'||Array.isArray(target[key]))target[key]={};
    target=target[key];
  }
  const k=p[p.length-1];
  if(op.type==='set')target[k]=op.value;
  else if(op.type==='delete')delete target[k];
  else{
    if(!Array.isArray(target[k]))target[k]=[];
    if(op.type==='fixture-upsert'){
      const i=target[k].findIndex(f=>f&&f.id===op.value.id);
      if(i<0)target[k].push(op.value);else target[k][i]=op.value;
    }else target[k]=target[k].filter(f=>f&&f.id!==op.id);
  }
}
async function getDatabase(){
  const q=await pool.query('SELECT payload, revision FROM chuletonbet_state WHERE id=1');
  return {database:q.rows[0].payload,revision:Number(q.rows[0].revision)};
}
async function applyChanges(ops){
  if(!Array.isArray(ops)||ops.length>500)throw new Error('Se permiten 500 cambios como máximo');
  ops.forEach(validateOp);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const r=await client.query('SELECT payload,revision FROM chuletonbet_state WHERE id=1 FOR UPDATE');
    const db=r.rows[0].payload;
    ops.forEach(op=>applyOp(db,op));
    const next=Number(r.rows[0].revision)+(ops.length?1:0);
    if(ops.length)await client.query('UPDATE chuletonbet_state SET payload=$1::jsonb,revision=$2,updated_at=now() WHERE id=1',[JSON.stringify(db),next]);
    await client.query('COMMIT');
    return {database:db,revision:next};
  }catch(err){await client.query('ROLLBACK');throw err;}
  finally{client.release();}
}
async function serveStatic(req,res,pathname){
  if(pathname!=='/'&&pathname!=='/index.html'){reply(res,404,{error:'No encontrado'});return;}
  try{
    const html=await fs.readFile(path.join(ROOT,'index.html'));
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-cache, must-revalidate','x-content-type-options':'nosniff'});
    if(req.method==='HEAD')res.end();else res.end(html);
  }catch(err){reply(res,500,{error:'No se pudo abrir la web'});}
}
async function main(){
  await pool.query('CREATE TABLE IF NOT EXISTS chuletonbet_state (id integer PRIMARY KEY CHECK (id=1), payload jsonb NOT NULL, revision bigint NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now())');
  await pool.query('INSERT INTO chuletonbet_state (id,payload) VALUES (1,$1::jsonb) ON CONFLICT DO NOTHING',[JSON.stringify(freshDatabase())]);
  const server=http.createServer(async (req,res)=>{
    try{
      const pathname=new URL(req.url,'http://localhost').pathname;
      if(req.method==='GET'&&pathname==='/health'){
        await pool.query('SELECT 1');reply(res,200,{ok:true});return;
      }
      if(req.method==='GET'&&pathname==='/api/database'){
        reply(res,200,await getDatabase());return;
      }
      if(req.method==='POST'&&pathname==='/api/patch'){
        if(!checkPin(req)){reply(res,401,{error:'Código de edición incorrecto o no indicado',pinRequired:true});return;}
        const body=await parseJson(req);
        reply(res,200,await applyChanges(body.ops));return;
      }
      if(req.method==='GET'||req.method==='HEAD'){
        await serveStatic(req,res,pathname);return;
      }
      reply(res,404,{error:'Ruta no encontrada'});
    }catch(err){
      console.error('HTTP:',err);
      reply(res,err.status||(/inválid|no permitid|Ruta|máximo|Falta valor|partido/i.test(err.message)?400:500),{error:err.status||(/inválid|no permitid|Ruta|máximo|Falta valor|partido/i.test(err.message))?err.message:'No se pudo completar la operación'});
    }
  });
  server.listen(PORT,'0.0.0.0',()=>console.log('ChuletonBet compartido activo en el puerto',PORT));
}
main().catch(err=>{console.error('No se pudo iniciar PostgreSQL:',err);process.exit(1);});
