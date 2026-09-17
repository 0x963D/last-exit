import {readFile} from 'node:fs/promises';
import {neon} from '@neondatabase/serverless';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required.');
const sql=neon(process.env.DATABASE_URL);
// Schema conventions: top-level statements start in column zero; function bodies are indented.
const statements=(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8')).split(/(?=^(?:CREATE|INSERT)\b)/m).filter(s=>s.trim());
await sql.transaction(statements.map(statement=>sql.query(statement)));
console.log('Last Exit schema applied; existing budget preserved.');
