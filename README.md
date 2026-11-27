# Finanzas

App de dinero del plan de 5 apps (pablocarvallo/casa → plan/plan-5-apps.md), con el diseño Domésticas 27. Publicada en
**https://pablocarvallo.github.io/finanzas/**. Convive un mes con FAN, Master, LiderBCI, Copec, Pagos del mes, Mesadas y
Mis créditos.

## Pestañas

- **Resumen**: las cuatro cuentas con su total, avisos, mesadas y créditos, y los últimos movimientos. Desde ahí se
  abren Mesadas y Mis créditos.
- **Cuentas**: FAN, Master, LiderBCI y Copec con su saldo, utilizado o total del periodo y movimientos. Master se lleva
  como el estado de cuenta del banco (ver «Master» más abajo). LiderBCI: al tocar «Puntos» en el recuadro se abre su
  detalle, con canjes y ajustes. Se anotan movimientos a mano y se ajusta el punto de partida.
- **Pagos**: pagos del mes en dos secciones, mes nuevo e historial.
- **Mesadas**: aportes a Piti y Emi con su asunto, totales por hija y del mes, historial.
- **Mis créditos**: consumo, hipotecario (UF) y deudas con abonos; pagos de cuota, abonos, saldo y término estimado.
  Al tocar un crédito se abre su página a pantalla completa (sin la barra de pestañas): saldo, anillo con las cuotas
  pagadas (o la parte abonada), barra de la deuda pagada, detalle, pagos o abonos registrados y sus botones. «‹ Mis
  créditos» o deslizar desde el borde izquierdo vuelve a la lista.
- **Ajustes**: conexión, traer datos de las apps antiguas, apariencia (skin Vidrio o Tinta electrónica, tema y vidrio) y
  respaldo.

Gastos médicos queda fuera de Finanzas: es una app independiente (pablocarvallo/cigna), por decisión del 24 nov 2026.

## Datos

En el repositorio privado pablocarvallo/datos, a través de domesticas-api con la llave de cada iPhone:

- `cuentas.json`: punto de partida de cada cuenta (`saldo_inicial` de FAN y Copec con fecha y hora, `periodo_desde` y
  `puntos_movimientos` de LiderBCI, la terminación de la cuenta FAN) y, en Master, `cupo`, `inicio`, `deuda_inicial`,
  `facturaciones` (las cerradas, con lo que informa el banco), `cuotas` (compras en cuotas anteriores al inicio) y
  `proximo_cierre`.
- `movimientos/AAAA-MM.json`: los movimientos del mes. Los avisos del banco y de Copec llegan solos (tarea «Leer avisos»);
  la app agrega los anotados a mano. Un movimiento de aviso tiene el id del lector (`fan|…`, `master|…`, `copec|…`), así
  el mismo movimiento traído de un respaldo antiguo no se repite.
- `pagos.json`: secciones con sus pagos, título del mes e historial.
- `mesadas.json`: aportes `{ id, hija, monto, asunto, fecha, registrado }`.
- `creditos.json`: créditos con sus pagos de cuota y abonos (mismos campos de la app Mis créditos, en minúsculas con «_»).

Cada registro es un cambio (`calculos.js` → `aplicar`) que se ve al tiro y espera en el iPhone hasta guardarse; si otro
dispositivo o la tarea de avisos guardó antes, la app vuelve a leer y aplica de nuevo.

## Reglas

Las de las apps antiguas (pruebas en `pruebas/calculos.test.js`):

- FAN y Copec: saldo ajustado + entradas − salidas desde ese momento. FAN sigue una sola cuenta (su terminación).
- Master: ver la sección «Master».
- LiderBCI: compras − abonos y devoluciones del periodo; puntos 6 % Lider, 0 % Jumbo, Unimarc, Tottus, Santa Isabel, El 9
  y Don Salva, 1 % el resto; «Cerrar periodo» guarda los puntos.
- Pagos: avisa los pendientes de inicio de mes desde el día 5 y los de mitad de mes desde el 20.
- Mesadas: lo entregado en el mes se ve en el Resumen.
- Mis créditos: saldo = valor presente de las cuotas que faltan + ajuste, redondeado a $10.000 (total de consumo a
  $100.000); hipotecario en UF, fuera del total; deudas con abonos = pendiente − abonos.

## Master

Se lleva igual que el estado de cuenta del Banco de Chile, por **facturaciones**: cada una va del día siguiente al cierre
anterior hasta su cierre y se nombra por el mes del cierre (noviembre 2026: del 23 oct al 20 nov). Empieza desde un
estado de cuenta: el código `{"app":"master-estado", …}` (Cuentas → Master → «Empezar desde el estado de cuenta», o
Ajustes → Traer datos) trae el cupo, el cupo utilizado, el monto facturado con todo su detalle y las compras en cuotas
que se siguen cobrando. También se puede empezar escribiendo solo las cifras. Desde el día siguiente al cierre cuentan
los movimientos que llegan por aviso o se anotan; los anteriores ya no se usan. La lectura de los correos no cambia.

- **Total a pagar** = saldo anterior (monto facturado de la facturación anterior) + pagos + compras Titular + compras
  Adicional + cuotas + cargos y abonos, con pagos y abonos en negativo. Es la cuenta del banco (A + B + C + D + E + F + G).
- **Titular / Adicional**: solo las compras a una cuota; lo elegido al anotar o, si no, la terminación del aviso
  (`tarjetas` en `cuentas.json`: ****9908 Titular, ****4526 Adicional).
- **Cuotas**: las compras en cuotas son una categoría aparte, sin Titular ni Adicional. Ocupan todo su monto en el cupo
  desde la compra y se cobran una cuota por facturación desde la **siguiente** a la de la compra (en el estado de cuenta
  de la compra aparecen como 00/03), salvo que se elija otra (`primera`). Cada cuota se redondea al peso y la última
  ajusta el total (200.000 en 3: 66.667, 66.667 y 66.666); si la compra tiene interés se anota `valor_cuota`.
- **Pagos y abonos**: `pago` es el pago de la tarjeta; `abono` (y `devolucion`, que llega por aviso) es una devolución o
  reversa. Los dos bajan la deuda, pero van en bloques distintos. `cargo`: comisiones, impuestos, intereses, seguros.
- **Cupo utilizado** = `deuda_inicial` + compras (todo su monto) + cargos − pagos − abonos desde su fecha. Disponible =
  cupo − utilizado. «Por pagar» = último monto facturado − pagos hechos después de su cierre.
- **Cierre**: si no se indica `proximo_cierre`, se estima el mismo día del último cierre, un mes después. «Cerrar con el
  estado de cuenta» guarda la fecha de cierre, la de pago, el monto facturado y el cupo utilizado del banco; el
  utilizado pasa a ser `deuda_inicial` desde el día siguiente. Si el banco no cuadra con lo calculado, el estado de
  cuenta muestra la diferencia. La última facturación cerrada se puede reabrir (no la del inicio).
- **Excel**: el estado de cuenta de cualquier facturación, con el resumen por bloque y el detalle (`excel.js`, sin
  bibliotecas), con fórmulas en los totales.

`resumen.json` (widgets) usa los mismos cálculos: `herramientas/finanzas-calculos.mjs` en pablocarvallo/datos es una copia
de `calculos.js`; actualizarla al cambiar las reglas.

## Mantener

- Diseño: `python3 ../casa/herramientas/aplicar-diseno27.py index.html` copia `casa/diseno27/` entre las marcas `D27`.
- Pruebas: `TZ=America/Santiago node --test pruebas/*.test.js`.
- Al publicar, subir `VERSION` en `calculos.js` (y `CACHE` en `sw.js`): la app se recarga sola al abrirse.
