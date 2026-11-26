// Pruebas del archivo de Excel del extracto de Master: que el ZIP esté bien armado (firmas, tamaños y CRC, revisados
// con zlib.crc32 de Node) y que las hojas lleven lo que deben.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import * as X from '../excel.js';
import * as F from '../calculos.js';

// Lee un ZIP sin compresión: devuelve { nombre: texto } y revisa cada CRC y el directorio central
function leerZip(u8) {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), dec = new TextDecoder();
  const finPos = u8.length - 22;
  assert.equal(v.getUint32(finPos, true), 0x06054b50, 'cierre del ZIP');
  const total = v.getUint16(finPos + 10, true), cdPos = v.getUint32(finPos + 16, true);
  const out = {};
  let p = cdPos;
  for (let i = 0; i < total; i++) {
    assert.equal(v.getUint32(p, true), 0x02014b50, 'directorio central');
    const crc = v.getUint32(p + 16, true), largo = v.getUint32(p + 20, true), nlen = v.getUint16(p + 28, true), local = v.getUint32(p + 42, true);
    const nombre = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    assert.equal(v.getUint32(local, true), 0x04034b50, 'cabecera local de ' + nombre);
    const ini = local + 30 + v.getUint16(local + 26, true), datos = u8.subarray(ini, ini + largo);
    assert.equal(zlib.crc32(datos), crc, 'CRC de ' + nombre);
    out[nombre] = dec.decode(datos);
    p += 46 + nlen;
  }
  return out;
}

const movs = [
  { id: 'a', cuenta: 'master', fecha: '2026-10-22', hora: '10:00', comercio: 'Fuera antes', monto: 1000, tipo: 'compra', titular: 'Titular' },
  { id: 'b', cuenta: 'master', fecha: '2026-10-23', hora: '09:15', comercio: 'Café & <Té>', monto: 4500, tipo: 'compra', titular: 'Titular' },
  { id: 'c', cuenta: 'master', fecha: '2026-11-02', hora: '', comercio: 'Falabella TV', monto: 359880, tipo: 'compra', titular: 'Adicional', cuotas: 12, prox: '2026-11' },
  { id: 'd', cuenta: 'master', fecha: '2026-11-10', hora: '08:00', comercio: 'Comisión mensual', monto: 3490, tipo: 'cargo' },
  { id: 'e', cuenta: 'master', fecha: '2026-11-15', hora: '12:00', comercio: 'Pago tarjeta', monto: 200000, tipo: 'abono' },
  // Cuotas por cobrar: falta 1 de 3 (la 3/3 en noviembre) y faltan 2 de las que no se anotó el total
  { id: 'f', cuenta: 'master', fecha: '2026-10-23', hora: '', comercio: 'SII', monto: 57980, tipo: 'cuota', titular: 'Titular', cuotas: 1, cuotas_total: 3, prox: '2026-11' },
  { id: 'g', cuenta: 'master', fecha: '2026-10-23', hora: '', comercio: 'Turistik', monto: 100001, tipo: 'cuota', titular: 'Titular', cuotas: 2, prox: '2026-10' },
  // Compra en 3 cuotas el 14 sep: 1/3 en sep, 2/3 en oct, 3/3 en nov
  { id: 'h', cuenta: 'master', fecha: '2026-09-14', hora: '14:45', comercio: 'Colegio', monto: 310000, tipo: 'compra', titular: 'Titular', cuotas: 3 },
  // Compra en 6 cuotas el 1 ago: la 4/6 se factura en noviembre
  { id: 'i', cuenta: 'master', fecha: '2026-08-01', hora: '', comercio: 'Agosto', monto: 90000, tipo: 'compra', titular: 'Titular', cuotas: 6 },
  { id: 'j', cuenta: 'fan', fecha: '2026-11-03', hora: '11:00', comercio: 'Otra cuenta', monto: 7000, tipo: 'compra' },
  { id: 'k', cuenta: 'master', fecha: '2026-11-22', hora: '23:59', comercio: 'Último día', monto: 1500, tipo: 'compra', titular: 'Adicional' },
  { id: 'l', cuenta: 'master', fecha: '2026-11-23', hora: '00:01', comercio: 'Fuera después', monto: 2000, tipo: 'compra' },
  // Compra en cuotas el 25 nov: su primera cuota es de diciembre
  { id: 'm', cuenta: 'master', fecha: '2026-11-25', hora: '', comercio: 'Después del cierre', monto: 30000, tipo: 'compra', titular: 'Titular', cuotas: 3 },
];
const ids = (sec) => sec.filas.map((f) => f.id + (f.cuota ? ':' + f.cuota + '/' + f.de : '') + '=' + f.monto);

test('extracto: total a pagar con compras de una cuota, cuotas del periodo con su número y cargos; abonos aparte', () => {
  const ex = F.extractoMaster(movs, '2026-10-23', '2026-11-22');
  assert.deepEqual(ids(ex.titular), ['b=4500']);
  assert.deepEqual(ids(ex.adicional), ['k=1500']);
  assert.deepEqual(ids(ex.cuotas), ['i:4/6=15000', 'h:3/3=103334', 'f:3/3=57980', 'g:2/2=50001', 'c:1/12=29990']);
  assert.deepEqual(ids(ex.cargos), ['d=3490']);
  assert.deepEqual(ids(ex.abonos), ['e=200000']);
  assert.equal(ex.cuotas.total, 15000 + 50001 + 103334 + 57980 + 29990);
  assert.equal(ex.total, 4500 + 1500 + ex.cuotas.total + 3490);
  assert.equal(ex.n, 8);
  // Las compras en cuotas no son de Titular ni de Adicional, aunque el movimiento traiga la tarjeta
  assert.equal(ex.cuotas.filas.find((f) => f.id === 'c').tarjeta, '');
  assert.equal(F.tarjetaDe({ cuenta: 'master', tipo: 'compra', titular: 'Adicional', cuotas: 3 }), '');
  assert.equal(F.tarjetaDe({ cuenta: 'master', tipo: 'compra', titular: 'Adicional', cuotas: 1 }), 'Adicional');
  assert.equal(F.tarjetaDe({ cuenta: 'master', tipo: 'compra' }), 'Titular');
  assert.equal(F.tarjetaDe({ cuenta: 'master', tipo: 'cuota', titular: 'Titular', cuotas: 2 }), '');
  // Varios meses: cada cuota en su facturación
  const largo = F.extractoMaster(movs, '2026-09-01', '2026-10-31');
  assert.deepEqual(ids(largo.cuotas), ['i:2/6=15000', 'h:1/3=103333', 'i:3/6=15000', 'h:2/3=103333', 'g:1/2=50000']);
  assert.equal(F.extractoMaster(movs, '2026-12-01', '2026-12-31').cuotas.filas.map((f) => f.id + ':' + f.cuota).join(), 'i:5,c:2,m:1');
});

test('cuotas: valor de cada una, número con el total anotado y estado', () => {
  const m = { monto: 100001, cuotas: 3 };
  assert.deepEqual([1, 2, 3].map((k) => F.valorCuota(m, k)), [33333, 33333, 33335]);
  assert.equal(F.desfaseCuotas({ tipo: 'cuota', cuotas: 1, cuotas_total: 3 }), 2);
  assert.equal(F.desfaseCuotas({ tipo: 'compra', cuotas: 3, cuotas_total: 6 }), 0);
  assert.equal(F.desfaseCuotas({ tipo: 'cuota', cuotas: 2 }), 0);
  const e = F.estadoCuotas({ fecha: '2026-10-23', tipo: 'cuota', monto: 57980, cuotas: 1, cuotas_total: 3, prox: '2026-11' }, '2026-11-10');
  assert.equal(e.desfase + e.hechas + 1, 3);
  assert.equal(e.de, 3);
});

test('extracto: por defecto, la última facturación cerrada (23 al 22)', () => {
  assert.deepEqual(F.periodoExtracto('2026-11-26'), { desde: '2026-10-23', hasta: '2026-11-22' });
  assert.deepEqual(F.periodoExtracto('2026-11-22'), { desde: '2026-09-23', hasta: '2026-10-22' });
  assert.deepEqual(F.periodoExtracto('2026-01-05'), { desde: '2025-11-23', hasta: '2025-12-22' });
  assert.deepEqual(F.periodoExtracto('2026-01-23'), { desde: '2025-12-23', hasta: '2026-01-22' });
});

test('Excel: ZIP válido con el extracto en el orden de la app', () => {
  const ex = F.extractoMaster(movs, '2026-10-23', '2026-11-22');
  const z = leerZip(X.extractoXlsx(ex, { generado: '26 nov 2026, 11:05', cupo: 2000000, utilizado: 589360, disponible: 1410640, enCuotas: 329890 }, new Date(2026, 10, 26, 11, 5)));
  assert.deepEqual(Object.keys(z).sort(), ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/sharedStrings.xml', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']);
  assert.match(z['xl/workbook.xml'], /<sheet name="Extracto" sheetId="1" r:id="rId1"\/>/);
  const sst = z['xl/sharedStrings.xml'], hoja = z['xl/worksheets/sheet1.xml'];
  assert.match(sst, /Café &amp; &lt;Té&gt;/);
  assert.match(sst, /Del 23 oct 2026 al 22 nov 2026 · generado el 26 nov 2026, 11:05/);
  // Orden de los bloques
  const texto = [...sst.matchAll(/<t xml:space="preserve">([^<]*)<\/t>/g)].map((x) => x[1]);
  const pos = (t) => texto.indexOf(t);
  assert.ok(pos('Total a pagar') < pos('Compras Titular') && pos('Compras Titular') < pos('Compras Adicional') && pos('Compras Adicional') < pos('Cuotas del periodo') && pos('Cuotas del periodo') < pos('Cargos'));
  assert.ok(texto.includes('3/3') && texto.includes('1/12') && texto.includes('Falabella TV') && !texto.some((t) => / · Adicional/.test(t)));
  // Total a pagar: suma de los totales de cada bloque (sin abonos), con su valor ya calculado
  assert.match(hoja, new RegExp('<c r="D4" s="9"><f>D6\\+D10\\+D14\\+D22</f><v>' + ex.total + '</v></c>'));
  assert.match(hoja, /<c r="D6" s="10"><f>SUM\(D8:D8\)<\/f><v>4500<\/v><\/c>/);
  assert.match(hoja, new RegExp('<c r="D14" s="10"><f>SUM\\(D16:D20\\)</f><v>' + ex.cuotas.total + '</v></c>'));
  assert.match(hoja, /<c r="A8" s="4"><v>46318<\/v><\/c>/);
  assert.match(sst, /Abonos \(pagos a la tarjeta; no se restan\)/);
  assert.match(hoja, /<v>1410640<\/v>/);
});

test('Excel: extracto sin movimientos y sin estado de la tarjeta', () => {
  const ex = F.extractoMaster([], '2026-12-01', '2026-12-31');
  const z = leerZip(X.extractoXlsx(ex));
  assert.match(z['xl/sharedStrings.xml'], /Sin movimientos/);
  assert.doesNotMatch(z['xl/sharedStrings.xml'], /Estado de la tarjeta|Cargos|Abonos/);
  assert.match(z['xl/worksheets/sheet1.xml'], /<c r="D4" s="9"><f>D6\+D10\+D14<\/f><v>0<\/v><\/c>/);
  assert.equal(X.nombreExtracto(ex), 'Extracto Master 2026-12-01 al 2026-12-31.xlsx');
});

test('Excel: columnas, nombres de hoja, autofiltro y hoja apaisada', () => {
  assert.deepEqual([0, 7, 25, 26, 27, 51, 52, 701, 702].map(X.columna), ['A', 'H', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
  const z = leerZip(X.libro([{ nombre: 'A/B: [prueba] con un nombre demasiado largo', filas: [['x', 1]] }, { nombre: 'Datos', filas: [['N°', 'Monto'], [1, 5]], filtro: 'A1:B2', congelar: true, horizontal: true }]));
  assert.match(z['xl/workbook.xml'], /<sheet name="A B {3}prueba {2}con un nombre dem" /);
  assert.match(z['xl/workbook.xml'], /localSheetId="1" hidden="1">'Datos'!\$A\$1:\$B\$2</);
  assert.match(z['xl/worksheets/sheet2.xml'], /<autoFilter ref="A1:B2"\/>/);
  assert.match(z['xl/worksheets/sheet2.xml'], /orientation="landscape"/);
  assert.match(z['xl/worksheets/sheet2.xml'], /state="frozen"/);
});
