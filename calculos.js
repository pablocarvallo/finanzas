// Finanzas · cálculos y cambios de los datos de dinero. Sin pantalla: lo usan la app (index.html) y las pruebas
// (node --test pruebas/*.test.js). Las reglas son las de las apps FAN, Master, LiderBCI, Copec y Pagos del mes, para
// que los números coincidan durante el mes de convivencia.
// Datos en pablocarvallo/datos: cuentas.json (punto de partida de cada cuenta), movimientos/AAAA-MM.json (un archivo
// por mes; los avisos del banco y de Copec llegan solos), pagos.json (pagos del mes), mesadas.json (aportes a Piti y
// Emi) y creditos.json (créditos de consumo, hipotecario y deudas con abonos, de ingreso manual).

export const VERSION = '1.2.0';

/* ---------- Fechas y formatos ---------- */
const pad = (n) => (n < 10 ? '0' : '') + n;
const utc = (k) => { const p = String(k).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); };
export function diaDe(d) { const x = new Date(d); return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); }
export function horaDe(d) { const x = new Date(d); return pad(x.getHours()) + ':' + pad(x.getMinutes()); }
export function sumarDias(k, n) { const d = new Date(utc(k) + n * 86400000); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
export function esFecha(k) { return /^\d{4}-\d{2}-\d{2}$/.test(String(k)) && sumarDias(k, 0) === k; }
export function esHora(h) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(h)); }
export function sumarMesesYM(ym, n) { const t = +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1) + n; return Math.floor(t / 12) + '-' + pad(t % 12 + 1); }
export function mesesEntre(a, b) { return (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)); }
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const nombreMes = (ym) => MESES[+ym.slice(5, 7) - 1];
export const tituloMes = (ym) => nombreMes(ym).charAt(0).toUpperCase() + nombreMes(ym).slice(1) + ' ' + ym.slice(0, 4);
export const fechaCorta = (k) => { const p = k.split('-'); return (+p[2]) + ' ' + MES[+p[1] - 1]; };
export const nombreDia = (k) => DIAS[new Date(utc(k)).getUTCDay()];
export const plural = (n, uno, varios) => (n === 1 ? uno : varios);
export const pesos = (n) => (n < 0 ? '−' : '') + '$\u00a0' + String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const miles = (n) => (n < 0 ? '−' : '') + String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const copiar = (o) => JSON.parse(JSON.stringify(o));
export function nuevoId(letra) { return letra + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
export const momento = (m) => m.fecha + 'T' + (m.hora || '00:00');

/* ---------- Plantillas ---------- */
export const PLANTILLAS = {
  'cuentas.json': { cuentas: [
    { id: 'fan', nombre: 'FAN', tipo: 'debito', banco: 'Banco de Chile', fuente: 'bancochile', saldo_inicial: null, terminacion: null },
    { id: 'master', nombre: 'Master', tipo: 'credito', banco: 'Banco de Chile', fuente: 'bancochile', cupo: null, deuda_inicial: null, tarjetas: { 9908: 'T', 4526: 'A' } },
    { id: 'liderbci', nombre: 'LiderBCI', tipo: 'credito', fuente: null, periodo_desde: null, puntos_movimientos: [],
      puntos: { porcentaje_lider: 6, sin_puntos: ['Jumbo', 'Unimarc', 'Tottus', 'Santa Isabel', 'El 9', 'Don Salva'], porcentaje_otros: 1 } },
    { id: 'copec', nombre: 'Copec Pay', tipo: 'prepago', fuente: 'copec', saldo_inicial: null },
  ] },
  'pagos.json': { titulo: '', secciones: [{ id: 'inicio', nombre: 'A inicios de mes', pagos: [] }, { id: 'mitad', nombre: 'A mitad de mes', pagos: [] }], historial: [] },
  'mesadas.json': { personas: ['Piti', 'Emi'], aportes: [] },
  'creditos.json': { creditos: [] },
};
export function plantilla(archivo) { return /^movimientos\//.test(archivo) ? [] : copiar(PLANTILLAS[archivo]); }
export function cuenta(cs, id) { return ((cs && cs.cuentas) || []).find((c) => c.id === id) || null; }
export const ORDEN = ['fan', 'master', 'liderbci', 'copec'];

/* ---------- Movimientos ---------- */
// Tipos: salen compra, giro, cargo, cuota (cuotas por cobrar de Master), pago y aporte; entran abono, devolución y
// depósito. Los avisos del banco y de Copec llegan como compra, giro o devolución.
export const SALIDAS = ['compra', 'giro', 'cargo', 'cuota', 'pago', 'aporte'];
export const ENTRADAS = ['abono', 'devolucion', 'deposito'];
export const signo = (m) => (ENTRADAS.includes(m.tipo) ? 1 : -1);
export const NOMBRE_TIPO = { compra: 'Compra', giro: 'Giro en cajero', cargo: 'Cargo', cuota: 'Cuotas por cobrar', pago: 'Pago', aporte: 'Aporte', abono: 'Abono', devolucion: 'Devolución', deposito: 'Depósito' };
export const TIPOS_DE = {
  fan: ['compra', 'giro', 'deposito'],
  master: ['compra', 'cargo', 'abono', 'cuota'],
  liderbci: ['compra', 'abono', 'devolucion'],
  copec: ['compra', 'abono', 'devolucion'],
};
export const mesDe = (m) => m.fecha.slice(0, 7);
export const archivoMes = (ym) => 'movimientos/' + ym + '.json';
// Del más nuevo al más antiguo
export function ordenar(lista) {
  return lista.sort((a, b) => (momento(a) < momento(b) ? 1 : momento(a) > momento(b) ? -1 : String(a.id) < String(b.id) ? 1 : -1));
}
// La clave de un aviso sin signos ni acentos en el comercio (la misma de lector/ en pablocarvallo/datos)
export function skel(key) {
  const p = String(key).split('|');
  return p[0] + '|' + (p[1] || '') + '|' + p.slice(2).join('').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/* ---------- Cuentas ---------- */
// FAN y Copec: saldo = saldo ajustado + lo que entró − lo que salió desde ese momento (fecha y hora).
// FAN sigue una sola cuenta: los avisos de otra terminación no cuentan.
function cuentaVista(c, movs, hoy) {
  const ym = hoy.slice(0, 7);
  const propios = movs.filter((m) => m.cuenta === c.id && !(c.terminacion && m.terminacion && m.terminacion !== c.terminacion));
  const p = c.saldo_inicial;
  const desde = p && p.fecha ? (p.fecha.length === 10 ? p.fecha + 'T00:00' : p.fecha) : null;
  let saldo = p ? p.monto : null;
  const cuentan = desde ? propios.filter((m) => momento(m) >= desde) : [];
  cuentan.forEach((m) => { saldo += signo(m) * m.monto; });
  const delMes = propios.filter((m) => mesDe(m) === ym);
  return {
    id: c.id, tipo: c.tipo, definida: !!desde, saldo, desde, propios,
    gastoMes: delMes.filter((m) => signo(m) < 0).reduce((s, m) => s + m.monto, 0),
    entradasMes: delMes.filter((m) => signo(m) > 0).reduce((s, m) => s + m.monto, 0),
  };
}

// Master: utilizado = saldo de partida + compras, cargos y cuotas por cobrar − abonos, desde el día «desde».
// Las compras en cuotas ocupan todo su monto en el cupo hasta que se pagan; cada cuota se cobra en la facturación de
// su mes, una por mes desde «prox» (la facturación cierra cerca del día 22).
export const CIERRE = 22;
export function proxDe(fecha) { const ym = fecha.slice(0, 7); return +fecha.slice(8, 10) <= CIERRE ? ym : sumarMesesYM(ym, 1); }
export const esCuotas = (m) => m.tipo === 'cuota' || (m.tipo === 'compra' && (m.cuotas || 1) > 1);
export function estadoCuotas(m, hoy) {
  const n = Math.max(1, m.cuotas || 1), prox = m.prox || proxDe(m.fecha), valor = Math.floor(m.monto / n);
  const hechas = Math.max(0, Math.min(n, mesesEntre(prox, proxDe(hoy))));
  const cobrado = hechas >= n ? m.monto : hechas * valor;
  return { n, hechas, pendientes: n - hechas, valor, cobrado, pendiente: m.monto - cobrado,
    siguiente: hechas < n ? sumarMesesYM(prox, hechas) : '', ultima: sumarMesesYM(prox, n - 1),
    valorSiguiente: hechas < n ? (hechas + 1 === n ? m.monto - valor * (n - 1) : valor) : 0 };
}
function masterVista(c, movs, hoy) {
  const ym = hoy.slice(0, 7);
  const propios = movs.filter((m) => m.cuenta === 'master');
  const p = c.deuda_inicial, desde = p && p.fecha ? p.fecha.slice(0, 10) : null;
  let utilizado = p ? p.monto : null;
  const cuentan = desde ? propios.filter((m) => m.fecha >= desde) : [];
  cuentan.forEach((m) => { utilizado += signo(m) < 0 ? m.monto : -m.monto; });
  const cuotas = cuentan.filter(esCuotas).map((m) => ({ m, e: estadoCuotas(m, hoy) }));
  const activas = cuotas.filter((x) => x.e.pendientes > 0);
  const delMes = propios.filter((m) => mesDe(m) === ym);
  const sal = delMes.filter((m) => signo(m) < 0);
  return {
    id: 'master', tipo: 'credito', definida: !!desde, desde, utilizado, cupo: c.cupo || null,
    disponible: c.cupo != null && utilizado != null ? c.cupo - utilizado : null, propios,
    cuotas: activas, cuotasPendiente: activas.reduce((s, x) => s + x.e.pendiente, 0),
    gastoMes: sal.reduce((s, m) => s + m.monto, 0),
    titularMes: sal.filter((m) => m.tipo === 'compra' && m.titular !== 'Adicional').reduce((s, m) => s + m.monto, 0),
    adicionalMes: sal.filter((m) => m.tipo === 'compra' && m.titular === 'Adicional').reduce((s, m) => s + m.monto, 0),
    cargosMes: sal.filter((m) => m.tipo !== 'compra').reduce((s, m) => s + m.monto, 0),
    entradasMes: delMes.filter((m) => signo(m) > 0).reduce((s, m) => s + m.monto, 0),
  };
}

// Extracto de Master: los movimientos entre dos fechas, ambas incluidas, del más antiguo al más nuevo. Los montos van
// como en el estado de cuenta del banco: compras, cargos y cuotas suman; abonos y devoluciones restan. Las compras en
// cuotas van por su monto total. Por defecto, la última facturación cerrada (del día 23 al 22).
export function periodoExtracto(hoy) {
  const ym = hoy.slice(0, 7), cierre = +hoy.slice(8, 10) > CIERRE ? ym : sumarMesesYM(ym, -1);
  return { desde: sumarMesesYM(cierre, -1) + '-' + pad(CIERRE + 1), hasta: cierre + '-' + pad(CIERRE) };
}
export const NOMBRE_TIPO_EXTRACTO = { compra: 'Compra', cuota: 'Cuotas de compra anterior', cargo: 'Cargo', abono: 'Abono', devolucion: 'Devolución' };
export function extractoMaster(movs, desde, hasta) {
  const filas = movs.filter((m) => m.cuenta === 'master' && m.fecha >= desde && m.fecha <= hasta)
    .sort((a, b) => (momento(a) < momento(b) ? -1 : momento(a) > momento(b) ? 1 : String(a.id) < String(b.id) ? -1 : 1))
    .map((m) => {
      const compra = m.tipo === 'compra' || m.tipo === 'cuota';
      return { id: m.id, fecha: m.fecha, hora: esHora(m.hora) ? m.hora : '', comercio: m.comercio || NOMBRE_TIPO[m.tipo] || m.tipo, tipo: m.tipo,
        tarjeta: compra ? (m.titular === 'Adicional' ? 'Adicional' : 'Titular') : '', cuotas: compra ? Math.max(1, Math.round(m.cuotas) || 1) : 0,
        monto: signo(m) < 0 ? m.monto : -m.monto };
    });
  const t = { titular: 0, nTitular: 0, adicional: 0, nAdicional: 0, cuotas: 0, nCuotas: 0, cargos: 0, nCargos: 0, abonos: 0, nAbonos: 0, total: 0 };
  filas.forEach((f) => {
    t.total += f.monto;
    if (f.tipo === 'compra' && f.tarjeta === 'Adicional') { t.adicional += f.monto; t.nAdicional++; }
    else if (f.tipo === 'compra') { t.titular += f.monto; t.nTitular++; }
    else if (f.tipo === 'cuota') { t.cuotas += f.monto; t.nCuotas++; }
    else if (f.monto < 0) { t.abonos += f.monto; t.nAbonos++; }
    else { t.cargos += f.monto; t.nCargos++; }
  });
  return { desde, hasta, filas, t };
}

// LiderBCI: total del periodo = compras − abonos y devoluciones desde el inicio del periodo. Puntos: 6 % en Lider,
// 0 % en los supermercados de la lista y 1 % en el resto, sin decimales; la devolución resta los puntos de su compra.
// Al cerrar el periodo, sus puntos pasan a «puntos_movimientos» y el periodo siguiente parte de cero.
const SIN_PUNTOS = [/(^|[^a-z0-9])jumbo([^a-z0-9]|$)/, /(^|[^a-z0-9])unimarc([^a-z0-9]|$)/, /(^|[^a-z0-9])tottus([^a-z0-9]|$)/,
  /(^|[^a-z0-9])santa\s*isabel([^a-z0-9]|$)/, /(^|[^a-z0-9])el\s*9([^0-9]|$)/, /(^|[^a-z0-9])don\s*salva([^a-z0-9]|$)/];
const plano = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const esLider = (comercio) => /(^|[^a-z0-9])lider([^a-z0-9]|$)/.test(plano(comercio));
export function tasaPuntos(comercio) { return esLider(comercio) ? 6 : SIN_PUNTOS.some((r) => r.test(plano(comercio))) ? 0 : 1; }
export function puntosDe(m) {
  const p = Math.floor(m.monto * tasaPuntos(m.comercio) / 100);
  return m.tipo === 'compra' ? p : m.tipo === 'devolucion' ? -p : 0;
}
function liderVista(c, movs, hoy) {
  const ym = hoy.slice(0, 7);
  const propios = movs.filter((m) => m.cuenta === 'liderbci');
  const desde = c.periodo_desde || null;
  const periodo = desde ? propios.filter((m) => m.fecha >= desde) : propios;
  const compras = periodo.filter((m) => signo(m) < 0).reduce((s, m) => s + m.monto, 0);
  const abonos = periodo.filter((m) => signo(m) > 0).reduce((s, m) => s + m.monto, 0);
  const puntosPeriodo = periodo.reduce((s, m) => s + puntosDe(m), 0);
  const puntos = puntosPeriodo + (c.puntos_movimientos || []).reduce((s, x) => s + x.pts, 0);
  const delMes = propios.filter((m) => mesDe(m) === ym);
  return {
    id: 'liderbci', tipo: 'credito', definida: true, desde, propios, periodo, compras, abonos, total: compras - abonos,
    nCompras: periodo.filter((m) => m.tipo === 'compra').length, puntosPeriodo, puntos,
    gastoMes: delMes.filter((m) => signo(m) < 0).reduce((s, m) => s + m.monto, 0),
    entradasMes: delMes.filter((m) => signo(m) > 0).reduce((s, m) => s + m.monto, 0),
  };
}

export function estadoCuentas(cs, movs, hoy) {
  const out = {};
  ORDEN.forEach((id) => {
    const c = cuenta(cs, id) || cuenta(PLANTILLAS['cuentas.json'], id);
    out[id] = id === 'master' ? masterVista(c, movs, hoy) : id === 'liderbci' ? liderVista(c, movs, hoy) : cuentaVista(c, movs, hoy);
    out[id].nombre = c.nombre;
  });
  return out;
}
// Desde qué mes hay que leer movimientos para calcular las cuentas
export function mesInicial(cs, hoy) {
  const fechas = [hoy];
  ORDEN.forEach((id) => {
    const c = cuenta(cs, id);
    if (!c) return;
    const f = (c.saldo_inicial && c.saldo_inicial.fecha) || (c.deuda_inicial && c.deuda_inicial.fecha) || c.periodo_desde;
    if (f) fechas.push(String(f).slice(0, 10));
  });
  return fechas.sort()[0].slice(0, 7);
}

/* ---------- Pagos del mes ---------- */
export function estadoPagos(p) {
  const todos = (p.secciones || []).flatMap((s) => (s.pagos || []).map((x) => Object.assign({ seccion: s.nombre }, x)));
  const hechos = todos.filter((x) => x.hecho);
  return { total: todos.length, hechos: hechos.length, pendientes: todos.filter((x) => !x.hecho) };
}

/* ---------- Mesadas ---------- */
// aportes: { id, hija ('Piti' o 'Emi'), monto, asunto, fecha, registrado (momento en que se anotó) }
export function estadoMesadas(md, hoy) {
  const ym = hoy.slice(0, 7), personas = (md && md.personas) || ['Piti', 'Emi'];
  const aportes = ((md && md.aportes) || []).filter((a) => a && esFecha(a.fecha) && a.monto > 0)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : (b.registrado || 0) - (a.registrado || 0)));
  const por = {};
  personas.forEach((p) => {
    const suyos = aportes.filter((a) => a.hija === p);
    por[p] = { total: suyos.reduce((s, a) => s + a.monto, 0), mes: suyos.filter((a) => a.fecha.slice(0, 7) === ym).reduce((s, a) => s + a.monto, 0), n: suyos.length };
  });
  const mes = personas.reduce((s, p) => s + por[p].mes, 0);
  // Asuntos para sugerir: los más usados últimamente
  const vistos = {};
  aportes.slice(0, 40).forEach((a) => { const k = String(a.asunto || '').trim(); if (k) vistos[k] = (vistos[k] || 0) + 1; });
  const sugerencias = Object.keys(vistos).sort((x, y) => vistos[y] - vistos[x]).slice(0, 4);
  return { personas, aportes, por, mes, total: aportes.reduce((s, a) => s + a.monto, 0), sugerencias: sugerencias.length ? sugerencias : ['Almuerzo', 'Ropa', 'Helados'] };
}

/* ---------- Mis créditos ---------- */
// Las reglas de la app Mis créditos. Consumo (pesos) e hipotecario (UF): saldo = cuota × ((1+i)^D − 1) / (i × (1+i)^D)
// + ajuste, con D = cuotas que faltan e i la tasa mensual (la anual se divide por 12). Cada crédito en pesos se redondea
// a $10.000 y el total de consumo a $100.000; en UF, a dos decimales. Deuda con abonos: sin interés ni cuotas,
// pendiente = pendiente al ingresarla − abonos.
export const RED_CREDITO = 10000, RED_TOTAL = 100000;
const tasaMensual = (c) => { const t = (+c.tasa || 0) / 100; return c.tasa_tipo === 'anual' ? t / 12 : t; };
function factorVP(i, d) { if (d <= 0) return 0; if (i === 0) return d; const f = Math.pow(1 + i, d); return (f - 1) / (i * f); }
function exacto(c, i, k) { const d = c.plazo - k; if (d <= 0) return 0; return Math.max(0, c.cuota * factorVP(i, d) + (+c.ajuste || 0)); }
const redondear = (v, mon) => (mon === 'UF' ? Math.round(v * 100) / 100 : RED_CREDITO * Math.round(v / RED_CREDITO));
const limitar = (v, a, b) => Math.min(b, Math.max(a, v));
export function estadoCredito(c, hoy) {
  if (c.tipo === 'abonos') {
    const abonado = (c.abonos || []).reduce((s, x) => s + x.monto, 0);
    const saldo = Math.max(0, (c.pendiente_base || 0) - abonado), inicial = Math.max(c.monto_inicial || 0, c.pendiente_base || 0);
    return { saldo, inicial, abonado, pagado: inicial - saldo, rem: saldo > 0 ? 1 : 0, pct: inicial > 0 ? limitar((inicial - saldo) / inicial, 0, 1) : 0 };
  }
  const n = c.plazo, i = tasaMensual(c), k = Math.min(n, (c.pagadas_inicial || 0) + (c.pagos || []).length), rem = n - k;
  const vp = c.cuota * factorVP(i, rem);
  const saldo = redondear(exacto(c, i, k), c.moneda), inicial = redondear(exacto(c, i, 0), c.moneda);
  const interesProx = rem > 0 ? vp * i : 0;
  const ym = hoy.slice(0, 7), pagoEsteMes = (c.pagos || []).some((p) => String(p.fecha).slice(0, 7) === ym);
  return {
    n, i, k, rem, vp, saldo, inicial, interesProx, capitalProx: rem > 0 ? c.cuota - interesProx : 0,
    porPagar: c.cuota * rem, interesRest: Math.max(0, c.cuota * rem - vp), pagoEsteMes,
    pct: inicial > 0 ? limitar((inicial - saldo) / inicial, 0, 1) : k / n,
    termino: rem === 0 ? null : sumarMesesYM(ym, rem - (pagoEsteMes ? 0 : 1)),
  };
}
export function estadoCreditos(cr, hoy) {
  const lista = ((cr && cr.creditos) || []).slice().sort((a, b) => ((a.creado || 0) - (b.creado || 0)) || (a.id < b.id ? -1 : 1))
    .map((c) => ({ c, e: estadoCredito(c, hoy) }));
  const t = { suma: 0, inicial: 0, cuotasMes: 0, porPagar: 0, termino: null, activos: 0, n: 0 };
  lista.filter((x) => x.c.tipo === 'consumo').forEach(({ c, e }) => {
    t.n++; t.suma += e.saldo; t.inicial += e.inicial; t.porPagar += e.porPagar;
    if (e.rem > 0) { t.activos++; t.cuotasMes += c.cuota; if (e.termino && (!t.termino || e.termino > t.termino)) t.termino = e.termino; }
  });
  t.saldo = RED_TOTAL * Math.round(t.suma / RED_TOTAL);
  t.pct = t.inicial > 0 ? limitar((t.inicial - t.suma) / t.inicial, 0, 1) : 0;
  return { lista, total: t };
}
export const ufTxt = (v) => 'UF\u00a0' + Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const montoCredito = (v, c) => (c.moneda === 'UF' ? ufTxt(v) : pesos(v));

/* ---------- Avisos ---------- */
export function avisos(E, P, hoy) {
  const out = [];
  ['fan', 'copec'].forEach((id) => { if (E[id].definida && E[id].saldo < 0) out.push({ tono: 'neg', peso: 0, ir: id, texto: 'El saldo de ' + E[id].nombre + ' está en negativo' }); });
  const m = E.master;
  if (m.disponible != null && m.cupo && m.disponible < m.cupo * 0.1) out.push({ tono: m.disponible < 0 ? 'neg' : 'aviso', peso: 1, ir: 'master', texto: 'A Master le queda poco cupo: ' + pesos(m.disponible) });
  ORDEN.forEach((id) => { if (id !== 'liderbci' && !E[id].definida) out.push({ tono: 'info', peso: 8, ir: id, texto: 'Falta el punto de partida de ' + E[id].nombre + ': trae su respaldo o ajusta el saldo' }); });
  const ym = hoy.slice(0, 7), titulo = tituloMes(ym);
  if (P.titulo && P.titulo !== titulo && P.total) out.push({ tono: 'aviso', peso: 3, ir: 'pagos', texto: 'Empieza ' + titulo + ' en Pagos del mes' });
  else if (P.pendientes && P.pendientes.length) {
    const dia = +hoy.slice(8, 10);
    const urgentes = P.pendientes.filter((x) => x.seccion === 'A inicios de mes' ? dia >= 5 : dia >= 20);
    if (urgentes.length) out.push({ tono: 'aviso', peso: 4, ir: 'pagos', texto: urgentes.length === 1 ? 'Falta pagar: ' + urgentes[0].texto : 'Faltan ' + urgentes.length + ' pagos del mes' });
  }
  return out.sort((a, b) => a.peso - b.peso);
}

/* ---------- Cambios ---------- */
// Cada cambio es { id, tipo, …datos } y se aplica sobre el contenido de un archivo (copia). Si el guardado choca con
// el de otro dispositivo o con la tarea que lee los avisos, la app vuelve a leer el archivo y aplica de nuevo los
// cambios pendientes. Los de movimientos se reconocen por el id del movimiento; los demás guardan sus ids recientes
// en «ultimos_cambios».
const MAX_IDS = 40;
export function aplicar(archivo, contenido, cambio) {
  const d = copiar(contenido == null ? plantilla(archivo) : contenido);
  const f = CAMBIOS[cambio.tipo];
  if (!f) throw new Error('Cambio desconocido: ' + cambio.tipo);
  if (Array.isArray(d)) { f(d, cambio); return ordenar(d); }
  d.ultimos_cambios = Array.isArray(d.ultimos_cambios) ? d.ultimos_cambios : [];
  if (cambio.id && d.ultimos_cambios.includes(cambio.id)) return d;
  f(d, cambio);
  if (cambio.id) d.ultimos_cambios = d.ultimos_cambios.concat(cambio.id).slice(-MAX_IDS);
  return d;
}
function cuentaDe(d, id) {
  d.cuentas = Array.isArray(d.cuentas) ? d.cuentas : [];
  let c = d.cuentas.find((x) => x.id === id);
  if (!c) { c = copiar(cuenta(PLANTILLAS['cuentas.json'], id)); d.cuentas.push(c); }
  return c;
}
function seccionDe(d, id) { return (d.secciones || []).find((s) => s.id === id); }
const CAMBIOS = {
  // movimientos/AAAA-MM.json
  movimiento(lista, { mov }) { const i = lista.findIndex((x) => x.id === mov.id); if (i >= 0) lista[i] = mov; else lista.push(mov); },
  borrarMovimiento(lista, { idMov }) { const i = lista.findIndex((x) => x.id === idMov); if (i >= 0) lista.splice(i, 1); },
  // Trae movimientos de un respaldo: agrega los que faltan; los que ya llegaron por aviso se quedan como están
  importarMovimientos(lista, { movs }) { movs.forEach((m) => { if (!lista.some((x) => x.id === m.id)) lista.push(m); }); },
  // cuentas.json
  partida(d, { cuenta: id, campo, valor }) { cuentaDe(d, id)[campo] = valor; },
  ajustesCuenta(d, { cuenta: id, valores }) { Object.assign(cuentaDe(d, id), valores); },
  puntos(d, { mov }) { const c = cuentaDe(d, 'liderbci'); c.puntos_movimientos = (c.puntos_movimientos || []).filter((x) => x.id !== mov.id).concat(mov); },
  borrarPuntos(d, { idMov }) { const c = cuentaDe(d, 'liderbci'); c.puntos_movimientos = (c.puntos_movimientos || []).filter((x) => x.id !== idMov); },
  // Cierra el periodo de LiderBCI: sus puntos quedan guardados y el periodo siguiente parte desde «desde»
  cerrarPeriodo(d, { desde, pts, fecha, idMov }) {
    const c = cuentaDe(d, 'liderbci');
    if (pts) c.puntos_movimientos = (c.puntos_movimientos || []).concat({ id: idMov, tipo: 'cierre', fecha, pts, nota: 'Periodo cerrado' });
    c.periodo_desde = desde;
  },
  // pagos.json
  pagoHecho(d, { seccion, idPago, hecho, fecha }) {
    const p = (seccionDe(d, seccion) || { pagos: [] }).pagos.find((x) => x.id === idPago);
    if (!p) return;
    p.hecho = !!hecho;
    if (hecho) p.fecha = fecha; else delete p.fecha;
  },
  pagoGuardar(d, { seccion, pago }) {
    (d.secciones || []).forEach((s) => { s.pagos = (s.pagos || []).filter((x) => x.id !== pago.id || s.id === seccion); });
    const s = seccionDe(d, seccion);
    if (!s) return;
    const i = s.pagos.findIndex((x) => x.id === pago.id);
    if (i >= 0) s.pagos[i] = Object.assign({}, s.pagos[i], pago); else s.pagos.push(pago);
  },
  pagoBorrar(d, { idPago }) { (d.secciones || []).forEach((s) => { s.pagos = (s.pagos || []).filter((x) => x.id !== idPago); }); },
  // Mes nuevo: el mes que termina queda en el historial; se desmarcan los pagos y se quitan los de una sola vez
  mesNuevo(d, { titulo, fecha }) {
    const reg = { titulo: d.titulo, cerrado: fecha, pagos: [] };
    (d.secciones || []).forEach((s) => {
      s.pagos.forEach((x) => reg.pagos.push({ t: x.texto, d: !!x.hecho, s: s.nombre }));
      s.pagos = s.pagos.filter((x) => !x.una_vez);
      s.pagos.forEach((x) => { x.hecho = false; delete x.fecha; });
    });
    if (reg.pagos.length) d.historial = [reg].concat(d.historial || []).slice(0, 24);
    d.titulo = titulo;
  },
  reemplazarPagos(d, { estado }) { Object.keys(d).forEach((k) => { if (k !== 'ultimos_cambios') delete d[k]; }); Object.assign(d, estado); },
  // mesadas.json
  aporte(d, { aporte }) { d.aportes = (d.aportes || []).filter((x) => x.id !== aporte.id).concat(aporte); },
  borrarAporte(d, { idAporte }) { d.aportes = (d.aportes || []).filter((x) => x.id !== idAporte); },
  reemplazarMesadas(d, { aportes }) { d.aportes = aportes; },
  // creditos.json
  credito(d, { credito }) {
    d.creditos = d.creditos || [];
    const i = d.creditos.findIndex((x) => x.id === credito.id);
    if (i >= 0) d.creditos[i] = Object.assign({}, d.creditos[i], credito); else d.creditos.push(credito);
  },
  borrarCredito(d, { idCredito }) { d.creditos = (d.creditos || []).filter((x) => x.id !== idCredito); },
  pagoCuota(d, { idCredito, fecha }) {
    const c = (d.creditos || []).find((x) => x.id === idCredito);
    if (c && (c.pagadas_inicial || 0) + (c.pagos || []).length < c.plazo) c.pagos = (c.pagos || []).concat({ fecha });
  },
  deshacerPago(d, { idCredito }) { const c = (d.creditos || []).find((x) => x.id === idCredito); if (c && (c.pagos || []).length) c.pagos = c.pagos.slice(0, -1); },
  abonoCredito(d, { idCredito, abono }) { const c = (d.creditos || []).find((x) => x.id === idCredito); if (c) c.abonos = (c.abonos || []).concat(abono); },
  deshacerAbono(d, { idCredito }) { const c = (d.creditos || []).find((x) => x.id === idCredito); if (c && (c.abonos || []).length) c.abonos = c.abonos.slice(0, -1); },
  reemplazarCreditos(d, { creditos }) { d.creditos = creditos; },
};

/* ---------- Respaldos de las apps antiguas ---------- */
const limpiar = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n || 60);
const idDe = (prefijo, x) => prefijo + String(x || nuevoId('r')).replace(/[^\w-]/g, '');
function porMes(movs) {
  const g = {};
  movs.forEach((m) => { (g[mesDe(m)] = g[mesDe(m)] || []).push(m); });
  return Object.keys(g).sort().map((ym) => ({ archivo: archivoMes(ym), cambio: { tipo: 'importarMovimientos', movs: g[ym] } }));
}
const momentoValido = (at) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(at || '')) && esFecha(String(at).slice(0, 10));
// Devuelve { app, nombre, resumen, cambios: [{ archivo, cambio }] } o { error }
export function leerRespaldo(texto) {
  let d;
  const t = String(texto || '').trim();
  if (/^MC1:/i.test(t)) return leerMisCreditos(t);
  try { d = JSON.parse(t); } catch (e) { return { error: 'El texto no es un respaldo. Cópialo de nuevo desde la app antigua.' }; }

  if (d && (d.app === 'fan' || d.app === 'copec') && Array.isArray(d.movimientos)) {
    const app = d.app, c = d.cuenta || {};
    const movs = d.movimientos.filter((p) => p && esFecha(p.date) && +p.amount > 0).map((p) => {
      const aviso = p.src === 'mail' && p.key;
      const tipo = app === 'fan' ? (p.type === 'd' ? 'deposito' : /^giro en cajero$/i.test(p.desc || '') ? 'giro' : 'compra')
        : p.type === 'd' ? (aviso && /^AN/.test(p.key) ? 'devolucion' : 'abono') : 'compra';
      const m = { origen: aviso ? 'aviso' : 'manual', cuenta: app, fecha: p.date, hora: esHora(p.time) ? p.time : '', comercio: limpiar(p.desc) || (tipo === 'deposito' ? 'Depósito' : 'Compra'),
        monto: Math.round(+p.amount), tipo, id: aviso ? app + '|' + skel(p.key) : idDe(app + '-', p.id) };
      if (app === 'fan' && /^\d{4}$/.test(String(p.acct || ''))) m.terminacion = String(p.acct);
      if (app === 'copec' && p.fmt) m.formato = p.fmt;
      return m;
    });
    const cambios = porMes(movs);
    const partida = momentoValido(c.at) ? { monto: Math.round(+c.amount) || 0, fecha: c.at } : null;
    const valores = { saldo_inicial: partida };
    if (app === 'fan' && /^\d{4}$/.test(String(c.acct || ''))) valores.terminacion = String(c.acct);
    cambios.unshift({ archivo: 'cuentas.json', cambio: { tipo: 'ajustesCuenta', cuenta: app, valores } });
    const nombre = app === 'fan' ? 'FAN' : 'Copec';
    return { app, nombre, cambios, resumen: movs.length + ' ' + plural(movs.length, 'movimiento', 'movimientos') + (partida ? ' y el saldo de ' + pesos(partida.monto) + ' del ' + fechaCorta(partida.fecha.slice(0, 10)) : ', sin saldo definido') };
  }

  if (d && d.app === 'master' && Array.isArray(d.movimientos)) {
    const c = d.tarjeta || {};
    const TIPO = { c: 'compra', g: 'cargo', a: 'abono', q: 'cuota' };
    const movs = d.movimientos.filter((p) => p && esFecha(p.date) && +p.amount > 0).map((p) => {
      const tipo = TIPO[p.type] || 'compra', aviso = p.src === 'mail' && p.key && tipo === 'compra';
      const m = { origen: aviso ? 'aviso' : 'manual', cuenta: 'master', fecha: p.date, hora: esHora(p.time) ? p.time : '', comercio: limpiar(p.desc) || NOMBRE_TIPO[tipo],
        monto: Math.round(+p.amount), tipo, id: aviso ? 'master|' + skel(p.key) : idDe('master-', p.id) };
      if (tipo === 'compra' || tipo === 'cuota') { m.titular = p.who === 'A' ? 'Adicional' : 'Titular'; m.cuotas = Math.max(1, Math.round(+p.n) || 1); }
      if ((tipo === 'cuota' || m.cuotas > 1) && /^\d{4}-\d{2}$/.test(String(p.prox || ''))) m.prox = p.prox;
      if (/^\d{4}$/.test(String(p.card || ''))) m.terminacion = String(p.card);
      return m;
    });
    const cambios = porMes(movs);
    const partida = esFecha(c.desde) ? { monto: Math.round(+c.saldo) || 0, fecha: c.desde } : null;
    cambios.unshift({ archivo: 'cuentas.json', cambio: { tipo: 'ajustesCuenta', cuenta: 'master', valores: { deuda_inicial: partida, cupo: +c.limit > 0 ? Math.round(+c.limit) : null } } });
    return { app: 'master', nombre: 'Master', cambios, resumen: movs.length + ' ' + plural(movs.length, 'movimiento', 'movimientos') + (partida ? ', saldo de partida ' + pesos(partida.monto) + ' desde el ' + fechaCorta(partida.fecha) : '') + (+c.limit > 0 ? ' y cupo ' + pesos(c.limit) : '') };
  }

  if (d && d.v === 2 && Array.isArray(d.compras) && Array.isArray(d.puntos)) {
    const movs = d.compras.filter((p) => p && esFecha(p.date) && +p.amount > 0).map((p) => ({
      origen: 'manual', cuenta: 'liderbci', fecha: p.date, hora: '', comercio: limpiar(p.store) || (p.kind ? 'Abono' : 'Compra'),
      monto: Math.round(+p.amount), tipo: p.kind === 'devolucion' ? 'devolucion' : p.kind ? 'abono' : 'compra', id: idDe('liderbci-', p.id),
      ...(p.kind === 'otro' ? { nota: 'Otro abono' } : {}),
    }));
    const pts = d.puntos.filter((m) => m && esFecha(m.date) && +m.pts).map((m) => ({ id: idDe('p-', m.id), tipo: ['cierre', 'canje', 'ajuste'].includes(m.type) ? m.type : 'ajuste', fecha: m.date, pts: Math.round(+m.pts), nota: limpiar(m.note, 120) }));
    const desde = movs.length ? movs.map((m) => m.fecha).sort()[0] : null;
    const cambios = porMes(movs);
    cambios.unshift({ archivo: 'cuentas.json', cambio: { tipo: 'ajustesCuenta', cuenta: 'liderbci', valores: { periodo_desde: desde, puntos_movimientos: pts } } });
    return { app: 'liderbci', nombre: 'LiderBCI', cambios, resumen: movs.length + ' ' + plural(movs.length, 'registro', 'registros') + ' del periodo y ' + pts.length + ' ' + plural(pts.length, 'movimiento', 'movimientos') + ' de puntos' };
  }

  if (d && Array.isArray(d.sections) && Array.isArray(d.history)) {
    const estado = {
      titulo: limpiar(d.title, 40),
      secciones: d.sections.map((s, i) => ({ id: idDe('s', s.id || i), nombre: limpiar(s.name, 40) || 'Pagos',
        pagos: (s.items || []).filter((x) => x && limpiar(x.text)).map((x) => Object.assign({ id: idDe('p', x.id), texto: limpiar(x.text, 80), hecho: !!x.done },
          x.done && esFecha(x.at) ? { fecha: x.at } : {}, x.once ? { una_vez: true } : {})) })),
      historial: d.history.map((h) => ({ titulo: limpiar(h.title, 40), cerrado: esFecha(h.closed) ? h.closed : '', pagos: (h.items || []).map((x) => ({ t: limpiar(x.t, 80), d: !!x.d, s: limpiar(x.s, 40) })) })),
    };
    const n = estado.secciones.reduce((s, x) => s + x.pagos.length, 0);
    return { app: 'pagos', nombre: 'Pagos del mes', cambios: [{ archivo: 'pagos.json', cambio: { tipo: 'reemplazarPagos', estado } }], resumen: n + ' ' + plural(n, 'pago', 'pagos') + ' en ' + estado.secciones.length + ' secciones' };
  }

  if (Array.isArray(d) && d.length && d[0] && 'who' in d[0] && 'amount' in d[0]) {
    const NOMBRES = { piti: 'Piti', emi: 'Emi' };
    const aportes = d.filter((r) => r && NOMBRES[r.who] && esFecha(r.date) && +r.amount > 0).map((r) => ({
      id: idDe('a-', r.id), hija: NOMBRES[r.who], monto: Math.round(+r.amount), asunto: limpiar(r.subject, 40), fecha: r.date, registrado: +r.ts > 0 ? +r.ts : 0 }));
    if (!aportes.length) return { error: 'El respaldo de Mesadas no tiene aportes.' };
    const total = aportes.reduce((s, a) => s + a.monto, 0);
    return { app: 'mesadas', nombre: 'Mesadas', cambios: [{ archivo: 'mesadas.json', cambio: { tipo: 'reemplazarMesadas', aportes } }],
      resumen: aportes.length + ' ' + plural(aportes.length, 'aporte', 'aportes') + ' por ' + pesos(total) };
  }
  if (d && Array.isArray(d.cases)) return { error: 'Este es el respaldo de Maletas: se trae en la app Casa.' };
  return { error: 'No reconozco este respaldo. Sirven los de FAN, Master, LiderBCI, Copec, Pagos del mes, Mesadas y Mis créditos.' };
}

// Código «MC1:» de Mis créditos: JSON en base64 (url) con una huella de control al final
const huellaMC = (t) => { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };
function deB64(t) {
  t = t.replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '=';
  const bin = atob(t), b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(b);
}
function leerMisCreditos(t) {
  const partes = t.slice(4).replace(/\s+/g, '').split('.');
  if (partes.length !== 2 || huellaMC(partes[0]) !== partes[1].toLowerCase()) return { error: 'El código de Mis créditos está incompleto o cambió algún carácter. Cópialo de nuevo.' };
  let o;
  try { o = JSON.parse(deB64(partes[0])); } catch (e) { return { error: 'El código de Mis créditos no se pudo leer.' }; }
  const arr = Array.isArray(o) ? o : o && Array.isArray(o.creditos) ? o.creditos : [];
  const n = (v) => (isFinite(+v) ? +v : 0);
  const creditos = arr.map((x, i) => {
    const tipo = x.tipo === 'hipotecario' ? 'hipotecario' : x.tipo === 'abonos' ? 'abonos' : 'consumo';
    const plazo = Math.max(1, Math.round(n(x.plazo)));
    return {
      id: 'cr' + i + '-' + String(n(x.creado) || i).replace(/\D/g, ''), nombre: limpiar(x.nombre, 40) || 'Crédito', tipo,
      moneda: tipo !== 'abonos' && x.moneda === 'UF' ? 'UF' : 'CLP', cuota: Math.max(0, n(x.cuota)), plazo, tasa: Math.max(0, n(x.tasa)),
      tasa_tipo: x.tasaTipo === 'anual' ? 'anual' : 'mensual', ajuste: n(x.ajuste), pagadas_inicial: Math.min(plazo, Math.max(0, Math.round(n(x.pagadasInicial)))),
      pagos: (Array.isArray(x.pagos) ? x.pagos : []).map((p) => ({ fecha: String((p && p.fecha) || '') })),
      monto_inicial: Math.max(0, Math.round(n(x.montoInicial))), pendiente_base: Math.max(0, Math.round(n(x.pendienteBase))),
      abonos: (Array.isArray(x.abonos) ? x.abonos : []).filter((p) => p && n(p.monto) > 0).map((p) => ({ fecha: String(p.fecha || ''), monto: Math.round(n(p.monto)) })),
      creado: n(x.creado) || i,
    };
  }).filter((c) => (c.tipo === 'abonos' ? c.monto_inicial : c.cuota) > 0);
  if (!creditos.length) return { error: 'El código de Mis créditos no trae créditos.' };
  return { app: 'creditos', nombre: 'Mis créditos', cambios: [{ archivo: 'creditos.json', cambio: { tipo: 'reemplazarCreditos', creditos } }],
    resumen: creditos.length + ' ' + plural(creditos.length, 'crédito', 'créditos') + ' con sus pagos y abonos' };
}
