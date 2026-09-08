import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import ts from 'typescript';
const require=createRequire(import.meta.url);
test('a failed bootstrap displays an error and retry instead of an endless splash',()=>{
  const file=new URL('../src/components/auth-gate.tsx',import.meta.url);
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const m={exports:{}};
  const req=id=>{
    if(id==='@tanstack/react-query')return {useQuery:()=>({isPending:false,data:undefined,error:new Error('FALLO_SIMULADO'),refetch(){}})};
    if(id==='@/lib/auth/use-current-user')return {useCurrentUserState:()=>({user:{id:'synthetic'},isPending:false})};
    if(id==='@/components/ui/button')return {Button:props=>React.createElement('button',props)};
    if(id==='@/lib/catalog')return {CYCLE:'26-27'};
    if(id.startsWith('@/'))return new Proxy({},{get:()=>()=>null});
    return require(id);
  };
  new Function('require','module','exports',code)(req,m,m.exports);
  const html=renderToStaticMarkup(React.createElement(m.exports.AuthGate,{},'PRIVATE CONTENT'));
  assert.match(html,/FALLO_SIMULADO/);assert.match(html,/Volver a intentar/);assert.doesNotMatch(html,/PRIVATE CONTENT|Ciclo 26-27/);
});
