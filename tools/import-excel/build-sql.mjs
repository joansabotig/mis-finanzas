#!/usr/bin/env node
/**
 * Importa el historial de gastos de la planilla (hoja "Gastos") a Mis Finanzas.
 *
 * Uso:
 *   node tools/import-excel/build-sql.mjs <planilla.xlsx> <ultimo-mes YYYY-MM> <email> [salida.sql]
 *
 * - Cada mes de la hoja es un bloque de columnas "Monto | Fecha | Concepto" (fila 7).
 * - Las fórmulas de las filas 3–6 indican qué filas son Fijos, Variables, Casa/Terreno e Inversión.
 * - Los bloques se asignan a meses contando hacia atrás desde <ultimo-mes> (el último bloque).
 * - Genera un .sql para pegar en Supabase → SQL Editor. Los movimientos van a una cuenta
 *   "Histórico (planilla)" desactivada y fuera del patrimonio: no cambia ningún saldo actual,
 *   pero alimenta Reportes y la búsqueda del historial.
 *
 * Sin dependencias: lee el .xlsx (zip) con zlib de Node.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

// ---------------------------------------------------------------- zip mínimo
function unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('No es un .xlsx válido');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataStart, dataStart + size);
    files.set(name, () => (method === 0 ? raw : inflateRawSync(raw)).toString('utf8'));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// ---------------------------------------------------------------- celdas
const decode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function colToNum(col) {
  return [...col].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
}
function numToCol(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function readSheet(files, sheetName) {
  const wb = files.get('xl/workbook.xml')();
  const rels = files.get('xl/_rels/workbook.xml.rels')();
  const sheetTag = [...wb.matchAll(/<sheet [^>]*>/g)].map((m) => m[0]).find((t) => decode(t).includes(`name="${sheetName}"`));
  if (!sheetTag) throw new Error(`No encontré la hoja "${sheetName}"`);
  const rid = /r:id="([^"]+)"/.exec(sheetTag)[1];
  const relTag = [...rels.matchAll(/<Relationship [^>]*>/g)].map((m) => m[0]).find((t) => t.includes(`Id="${rid}"`));
  const target = /Target="([^"]+)"/.exec(relTag)[1].replace(/^\/?xl\//, '');
  const shared = files.has('xl/sharedStrings.xml')
    ? [...files.get('xl/sharedStrings.xml')().matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
        decode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
      )
    : [];
  const xml = files.get('xl/' + target)();
  const cells = new Map(); // "B8" → { v, f }
  for (const c of xml.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const body = c[4] ?? '';
    const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    const f = /<f[^>]*>([\s\S]*?)<\/f>/.exec(body)?.[1];
    const inline = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1];
    let value = v !== undefined ? decode(v) : inline !== undefined ? decode(inline) : undefined;
    if (/t="s"/.test(c[3]) && v !== undefined) value = shared[Number(v)];
    if (value === undefined && !f) continue;
    cells.set(c[1] + c[2], { v: value, f: f ? decode(f) : undefined });
  }
  return cells;
}

/** Filas referenciadas por una fórmula: "SUM(B8:B13)" → 8..13, "=B45+B46" → 45, 46. */
function rowsOf(formula, col) {
  const rows = new Set();
  for (const m of (formula ?? '').matchAll(/([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?/g)) {
    if (m[1] !== col) continue;
    const a = Number(m[2]);
    const b = m[4] ? Number(m[4]) : a;
    for (let r = Math.min(a, b); r <= Math.max(a, b); r++) rows.add(r);
  }
  return rows;
}

// ---------------------------------------------------------------- categorías
const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const RULES = [
  ['Inversión', /bull ?market|compra (de )?dolar|dolares|fci|plazo fijo|inversion|ahorro/],
  ['Compras', /merc(ado)? ?libre|mer libre|temu|shein|amazon|ropa|zapatill|remera|campera|libro|reloj|guantes|disfraz|regal/],
  ['Supermercado', /super|carrefour|coto|\bdia\b|verduler|carniceria|almacen|chino|mayorista|vea\b|chango ?mas|walmart|frutas/],
  ['Nafta', /nafta|combustible|ypf|axion|gasoil|surtidor/],
  ['Auto y moto', /aceite|cubierta|bateria|lavado auto|estacionamiento|peaje|tunel|uber|cuota moto|mecanico|service|repuesto|gomeria|vtv/],
  ['Salud', /farmacia|osde|medic|doctor|odonto|dentista|proteina|creatina|peluq/],
  ['Viajes', /vacacion|viaje|villa|hotel|pasaje|micro\b|avion/],
  ['Seguros', /seguro|previsora|swiss/],
  ['Impuestos', /monotributo|\bater\b|municipal|tasa|afip|arca|arba|impuesto|patente|rentas/],
  ['Suscripciones', /netflix|disney|spotify|youtube|claude|chatgpt|openai|hbo|\bmax\b|prime|paramount|icloud|google one|voley/],
  ['Servicios', /luz|enersa|edenor|edesur|\bagua\b|\bgas\b|internet|starlink|alarma|telefono|celular|personal|claro|movistar|fibertel|cable/],
  ['Hobbies', /pesca|gym|gimnasio|futbol|padel|bici|cancha|cine|circo|pool|motoencuentro|peces/],
  ['Comida y salidas', /pizza|burg|hambur|helado|sangu|comida|cena|almuerzo|resto|bar\b|cerveza|birra|kiosco|cafe|coff|delivery|rappi|pedidos ?ya|lomo|empanada|asado|salida|cumple|vianda|folder|bondiola|chocolate|picada|golosina|sushi|coca|merienda|panaderia|hielo|juntada|pena\b|gambrinus/],
  ['Casa', /casa|limpieza|sillon|mueble|ferreter|pintura|terreno|cochera|arreglo|electro|pasto|aluminio/],
];

function categorize(concept, section) {
  if (section === 'casa') return 'Casa';
  if (section === 'inversion') return 'Inversión';
  const c = norm(concept);
  for (const [cat, re] of RULES) if (re.test(c)) return cat;
  return section === 'fijo' ? 'Servicios' : 'Otros';
}

// ---------------------------------------------------------------- main
const [xlsxPath, lastMonth, email, outPath = 'supabase/import-historial.local.sql'] = process.argv.slice(2);
if (!xlsxPath || !/^\d{4}-\d{2}$/.test(lastMonth ?? '') || !email) {
  console.error('Uso: node tools/import-excel/build-sql.mjs <planilla.xlsx> <ultimo-mes YYYY-MM> <email> [salida.sql]');
  process.exit(1);
}

const cells = readSheet(unzip(readFileSync(xlsxPath)), 'Gastos');
const cell = (col, row) => cells.get(col + row);
const excelDate = (serial) => {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(Number(serial)) * 86400000);
  return d.toISOString().slice(0, 10);
};
const addMonths = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

const blocks = [...cells]
  .filter(([ref, c]) => /^[A-Z]+7$/.test(ref) && norm(c.v ?? '') === 'monto')
  .map(([ref]) => colToNum(ref.replace('7', '')))
  .sort((a, b) => a - b);

const rows = [];
const report = [];
blocks.forEach((amountColNum, i) => {
  const month = addMonths(lastMonth, i - blocks.length + 1);
  const [A, D, C] = [amountColNum, amountColNum + 1, amountColNum + 2].map(numToCol);
  const fixed = rowsOf(cell(A, 3)?.f, A);
  const casa = rowsOf(cell(A, 5)?.f, A);
  const inversion = rowsOf(cell(A, 6)?.f, A);
  const all = rowsOf(cell(A, 2)?.f, A);
  for (const r of [...rowsOf(cell(A, 4)?.f, A), ...fixed, ...casa, ...inversion]) all.add(r);

  let total = 0;
  let inMonth = 0;
  let dated = 0;
  for (const r of [...all].sort((a, b) => a - b)) {
    if (r < 8) continue;
    const amount = Number(cell(A, r)?.v);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const concept = (cell(C, r)?.v ?? '').toString().trim() || 'Sin descripción';
    const section = fixed.has(r) ? 'fijo' : casa.has(r) ? 'casa' : inversion.has(r) ? 'inversion' : 'variable';
    // La fecha de la planilla a veces quedó copiada de meses anteriores: si no cae en el mes del bloque, usamos el día 1.
    const serial = Number(cell(D, r)?.v);
    let date = `${month}-01`;
    if (Number.isFinite(serial) && serial > 30000) {
      dated++;
      const d = excelDate(serial);
      if (d.startsWith(month)) {
        date = d;
        inMonth++;
      }
    }
    const ok = ['ok'].includes(norm(cell(numToCol(amountColNum - 1), r)?.v ?? '')) || norm(cell(numToCol(amountColNum + 3), r)?.v ?? '') === 'ok';
    rows.push({ month, date, amount: Math.round(amount * 100) / 100, concept, section, category: categorize(concept, section), ok });
    total += amount;
  }
  report.push({ month, col: A, movimientos: rows.filter((x) => x.month === month).length, total: Math.round(total), fechasDelMes: dated ? `${inMonth}/${dated}` : '-' });
});

console.table(report);
const byCat = {};
for (const r of rows) byCat[r.category] = (byCat[r.category] ?? 0) + 1;
console.log('Movimientos por categoría:', byCat);

// ---------------------------------------------------------------- SQL
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const values = rows.map(
  (r) =>
    `(${q(r.date)}, ${r.amount}, ${q(r.concept)}, ${q(r.category)}, ${q(r.month)}, ${r.section === 'fijo' && r.ok ? 'true' : 'false'}, ${q(norm(r.concept))})`,
);
const linkable = rows.filter((r) => r.section === 'fijo' && r.ok);
console.log(`Fijos marcados "ok" (se vinculan a la plantilla si el nombre coincide): ${linkable.length}, último mes: ${linkable.filter((r) => r.month === lastMonth).map((r) => r.concept).join(', ')}`);

const sql = `-- =====================================================================
-- Importación del historial de la planilla (${rows.length} movimientos, ${report[0]?.month} a ${lastMonth}).
-- Generado por tools/import-excel/build-sql.mjs — contiene datos personales: no subir a git.
-- Pegar en Supabase → SQL Editor → Run. Se puede correr de nuevo: primero borra lo importado antes.
-- =====================================================================
do $$
declare
  u   uuid := (select id from auth.users where email = ${q(email)});
  acc uuid;
begin
  if u is null then raise exception 'No existe el usuario ${email.replace(/'/g, "''")}'; end if;

  -- Cuenta oculta para el historial: no suma al patrimonio ni aparece en la lista.
  select id into acc from public.accounts where user_id = u and name = 'Histórico (planilla)';
  if acc is null then
    insert into public.accounts (user_id, name, type, currency, include_in_total, is_active, sort_order)
    values (u, 'Histórico (planilla)', 'cash', 'ARS', false, false, 999)
    returning id into acc;
  end if;
  delete from public.transactions where account_id = acc;

  -- Categorías que use la importación y todavía no existan.
  insert into public.categories (user_id, name, kind, grp, icon)
  select u, c.name, 'expense', c.grp, c.icon
  from (values
    ('Supermercado','variable','shopping_cart'), ('Nafta','variable','local_gas_station'),
    ('Comida y salidas','variable','restaurant'), ('Compras','variable','shopping_bag'),
    ('Hobbies','variable','sports_volleyball'), ('Otros','variable','more_horiz'),
    ('Auto y moto','variable','two_wheeler'), ('Salud','variable','local_hospital'), ('Viajes','variable','flight'),
    ('Servicios','fijo','bolt'), ('Suscripciones','fijo','subscriptions'), ('Seguros','fijo','shield'),
    ('Impuestos','fijo','account_balance'), ('Casa','casa','home'), ('Inversión','inversion','savings')
  ) as c(name, grp, icon)
  where not exists (select 1 from public.categories x where x.user_id = u and x.name = c.name and x.kind = 'expense');

  -- Los fijos con "ok" en la planilla se vinculan al gasto fijo de la app con el mismo nombre
  -- (sin importar mayúsculas ni tildes), así el checklist de ese mes los muestra como pagados.
  insert into public.transactions (user_id, date, type, account_id, amount, description, category_id, recurring_id, period)
  select u, v.date::date, 'expense', acc, v.amount, v.concept,
         (select id from public.categories c where c.user_id = u and c.name = v.category and c.kind = 'expense' limit 1),
         ri.id,
         case when ri.id is not null then v.period end
  from (values
    ${values.join(',\n    ')}
  ) as v(date, amount, concept, category, period, fixed_ok, match_key)
  left join lateral (
    select r.id from public.recurring_items r
    where v.fixed_ok and r.user_id = u and r.kind = 'expense'
      and lower(translate(trim(r.name), 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu')) = v.match_key
    limit 1
  ) ri on true;

  raise notice 'Importados % movimientos (% fijos marcados como pagados)',
    (select count(*) from public.transactions where account_id = acc),
    (select count(*) from public.transactions where account_id = acc and recurring_id is not null);
end $$;
`;

writeFileSync(outPath, sql);
console.log(`\n✔ ${rows.length} movimientos → ${outPath}`);
