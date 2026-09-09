import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const root=path.dirname(fileURLToPath(import.meta.url));
const base=fs.readFileSync(path.join(root,'worker-base.js'),'utf8');
if(base.split('/* POINTMAP_MODULE */').length!==2)throw new Error('Expected one PM module marker');
await build({stdin:{contents:base.replace('/* POINTMAP_MODULE */',fs.readFileSync(path.join(root,'pointmap.js'),'utf8')),resolveDir:root,sourcefile:'worker-assembled.mjs'},bundle:true,format:'esm',target:'es2022',outfile:path.join(root,'worker.js')});
