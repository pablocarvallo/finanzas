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
  { id: 'c', cuenta: 'master', fecha: '2026-11-02', hora: '', comercio: 'Falabella TV', monto: 359880, tipo: 'compra', titular: 'Adicional', cuotas: 12 },
  { id: 'd', cuenta: 'master', fecha: '2026-11-10', hora: '08:00', comercio: 'Comisión mensual', monto: 3490, tipo: 'cargo' },
  { id: 'e', cuenta: 'master', fecha: '2026-11-15', hora: '12:00', comercio: 'Pago tarjeta', monto: 200000, tipo: 'abono' },
  { id: 'f', cuenta: 'master', fecha: '2026-11-01', hora: '18:30', comercio: 'Notebook', monto: 60000, tipo: 'cuota', titular: 'Titular', cuotas: 3 },
  { id: 'g', cuenta: 'fan', fecha: '2026-11-03', hora: '11:00', comercio: 'Otra cuenta', monto: 7000, tipo: 'compra' },
  { id: 'h', cuenta: 'master', fecha: '2026-11-22', hora: '23:59', comercio: 'Último día', monto: 1500, tipo: 'compra', titular: 'Adicional' },
  { id: 'i', cuenta: 'master', fecha: '2026-11-23', hora: '00:01', comercio: 'Fuera después', monto: 2000, tipo: 'compra' },
];

test('extracto: fechas incluidas, orden, montos como deuda y totales', () => {
  const ex = F.extractoMaster(movs, '2026-10-23', '2026-11-22');
  assert.deepEqual(ex.filas.map((f) => f.id), ['b', 'f', 'c', 'd', 'e', 'h']);
  assert.deepEqual(ex.filas.map((f) => f.monto), [4500, 60000, 359880, 3490, -200000, 1500]);
  assert.equal(ex.filas.find((f) => f.id === 'c').tarjeta, 'Adicional');
  assert.equal(ex.filas.find((f) => f.id === 'c').cuotas, 12);
  assert.equal(ex.filas.find((f) => f.id === 'd').tarjeta, '');
  assert.deepEqual(ex.t, { titular: 4500, nTitular: 1, adicional: 361380, nAdicional: 2, cuotas: 60000, nCuotas: 1, cargos: 3490, nCargos: 1, abonos: -200000, nAbonos: 1, total: 229370 });
  const vacio = F.extractoMaster(movs, '2026-12-01', '2026-12-31');
  assert.equal(vacio.filas.length, 0);
  assert.equal(vacio.t.total, 0);
});

test('extracto: por defecto, la última facturación cerrada (23 al 22)', () => {
  assert.deepEqual(F.periodoExtracto('2026-11-26'), { desde: '2026-10-23', hasta: '2026-11-22' });
  assert.deepEqual(F.periodoExtracto('2026-11-22'), { desde: '2026-09-23', hasta: '2026-10-22' });
  assert.deepEqual(F.periodoExtracto('2026-01-05'), { desde: '2025-11-23', hasta: '2025-12-22' });
  assert.deepEqual(F.periodoExtracto('2026-01-23'), { desde: '2025-12-23', hasta: '2026-01-22' });
});

test('Excel: ZIP válido con las partes de un .xlsx', () => {
  const ex = F.extractoMaster(movs, '2026-10-23', '2026-11-22');
  const z = leerZip(X.extractoXlsx(ex, { generado: '26 nov 2026, 11:05', cupo: 2000000, utilizado: 589360, disponible: 1410640, enCuotas: 329890 }, new Date(2026, 10, 26, 11, 5)));
  assert.deepEqual(Object.keys(z).sort(), ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/sharedStrings.xml', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']);
  assert.match(z['xl/workbook.xml'], /<sheet name="Resumen" sheetId="1" r:id="rId1"\/><sheet name="Movimientos" sheetId="2" r:id="rId2"\/>/);
  assert.match(z['xl/workbook.xml'], /localSheetId="1" hidden="1">'Movimientos'!\$A\$1:\$H\$7</);
  // Textos escapados y compartidos
  assert.match(z['xl/sharedStrings.xml'], /Café &amp; &lt;Té&gt;/);
  assert.match(z['xl/sharedStrings.xml'], /Del 23 oct 2026 al 22 nov 2026 · generado el 26 nov 2026, 11:05/);
  assert.match(z['xl/sharedStrings.xml'], /Compra en cuotas/);
  // Movimientos: fecha como número de Excel (23 oct 2026 = 46318), hora como fracción, monto del abono negativo y total
  const hoja = z['xl/worksheets/sheet2.xml'];
  assert.match(hoja, /<c r="B2" s="4"><v>46318<\/v><\/c>/);
  assert.match(hoja, /<c r="C2" s="5"><v>0\.3854166666666667<\/v><\/c>/);
  assert.match(hoja, /<c r="H6" s="2"><v>-200000<\/v><\/c>/);
  assert.match(hoja, /<c r="H9" s="3"><f>SUBTOTAL\(9,H2:H7\)<\/f><v>229370<\/v><\/c>/);
  assert.match(hoja, /<autoFilter ref="A1:H7"\/>/);
  assert.match(hoja, /state="frozen"/);
  // Resumen: total del periodo y estado al generar
  const res = z['xl/worksheets/sheet1.xml'];
  assert.match(res, /<c r="B10" s="3"><v>229370<\/v><\/c>/);
  assert.match(res, /<v>1410640<\/v>/);
});

test('Excel: extracto sin movimientos y sin estado de la tarjeta', () => {
  const ex = F.extractoMaster([], '2026-12-01', '2026-12-31');
  const z = leerZip(X.extractoXlsx(ex));
  assert.doesNotMatch(z['xl/workbook.xml'], /definedName/);
  assert.doesNotMatch(z['xl/worksheets/sheet2.xml'], /autoFilter/);
  assert.match(z['xl/sharedStrings.xml'], /Sin movimientos en estas fechas\./);
  assert.doesNotMatch(z['xl/sharedStrings.xml'], /Estado de la tarjeta/);
  assert.equal(X.nombreExtracto(ex), 'Extracto Master 2026-12-01 al 2026-12-31.xlsx');
});

test('Excel: columnas y nombres de hoja', () => {
  assert.deepEqual([0, 7, 25, 26, 27, 51, 52, 701, 702].map(X.columna), ['A', 'H', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
  const z = leerZip(X.libro([{ nombre: 'A/B: [prueba] con un nombre demasiado largo', filas: [['x', 1]] }]));
  assert.match(z['xl/workbook.xml'], /<sheet name="A B {3}prueba {2}con un nombre dem" /);
});
