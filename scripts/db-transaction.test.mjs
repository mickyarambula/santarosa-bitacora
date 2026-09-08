import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const file = new URL('../src/lib/db.ts', import.meta.url);
const require = createRequire(file);
function adapter(fail=false) {
  const events=[];
  class Pool {
    async query(){ throw Error('Transaction escaped to the pool'); }
    async connect(){return {query:async(q,p)=>{events.push(q);if(fail && q==='insert synthetic')throw Error('write failed');return {rows:[{value:p?.[0]}]};},release(){events.push('release');}};}
  }
  const source=readFileSync(file,'utf8').replaceAll('import.meta.glob','unusedGlob');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const m={exports:{}};
  new Function('require','module','exports','process','globalThis',code)(id=>id==='pg'?{Pool,types:{setTypeParser(){}}}:require(id),m,m.exports,{env:{DATABASE_URL:'postgres://synthetic.invalid/test'}},{});
  return {getSql:m.exports.getSql,events};
}
test('Postgres adapter pins every nested operation to one connection and releases after commit',async()=>{
  const a=adapter();const sql=await a.getSql();
  const result=await sql.transaction(async tx=>{await tx`select ${'test'}`;return tx.transaction(inner=>inner.query('nested',[42]));});
  assert.equal(result[0].value,42);
  assert.deepEqual(a.events,['begin','select pg_advisory_xact_lock(1397900101)','select $1','nested','commit','release']);
});
test('Postgres adapter rolls back a failed write and always releases the connection',async()=>{
  const a=adapter(true);const sql=await a.getSql();await assert.rejects(sql.transaction(tx=>tx.query('insert synthetic')),/write failed/);
  assert.deepEqual(a.events,['begin','select pg_advisory_xact_lock(1397900101)','insert synthetic','rollback','release']);
});
