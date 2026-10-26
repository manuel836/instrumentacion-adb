// Lector mínimo de Excel (.xlsx) y CSV para importar instrumentos. Un .xlsx es un zip
// con XML: se descomprime con fflate y se leen las celdas con expresiones regulares
// (sin DOM, para poder probarlo en Node). Solo hace falta texto, números y booleanos;
// las fechas llegan como número de serie de Excel y las interpreta importar.ts.

import { strFromU8, unzipSync } from 'fflate'

export type Celda = string | number | boolean | null

export interface HojaLeida {
  nombre: string
  filas: Celda[][]
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function desescapar(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    return ENTIDADES[e] ?? m
  })
}

/** Texto de un nodo <si> o <is>: une todas las <t> (texto con formato viene en varias). */
function textoDe(xml: string): string {
  let out = ''
  // Las anotaciones fonéticas (<rPh>) no son parte del texto.
  for (const m of xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, '').matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)) out += m[1]
  return desescapar(out)
}

function atributo(tag: string, nombre: string): string | null {
  const m = new RegExp(`\\s${nombre}="([^"]*)"`).exec(tag)
  return m ? desescapar(m[1]) : null
}

/** "C12" → índice de columna 2 (base 0). */
function columna(ref: string): number {
  let n = 0
  for (const ch of ref.replace(/\d+$/, '').toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function leerHoja(xml: string, compartidos: string[]): Celda[][] {
  const filas: Celda[][] = []
  for (const fila of xml.matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
    const r = atributo(fila[1], 'r')
    const indice = r ? Number(r) - 1 : filas.length
    const celdas: Celda[] = []
    let siguiente = 0
    for (const c of (fila[2] ?? '').matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const ref = atributo(c[1], 'r')
      const col = ref ? columna(ref) : siguiente
      siguiente = col + 1
      const tipo = atributo(c[1], 't')
      const cuerpo = c[2] ?? ''
      const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(cuerpo)?.[1]
      let valor: Celda = null
      if (tipo === 's') valor = v === undefined ? null : (compartidos[Number(v)] ?? null)
      else if (tipo === 'inlineStr') valor = textoDe(cuerpo)
      else if (tipo === 'str') valor = v === undefined ? null : desescapar(v)
      else if (tipo === 'b') valor = v === '1'
      else if (tipo === 'e') valor = null
      else if (v !== undefined && v !== '') valor = Number(v)
      celdas[col] = valor
    }
    filas[indice] = Array.from(celdas, (x) => x ?? null)
  }
  return Array.from(filas, (f) => f ?? [])
}

/** Lee todas las hojas de un .xlsx. */
export function leerXlsx(datos: Uint8Array): HojaLeida[] {
  let archivos: Record<string, Uint8Array>
  try {
    archivos = unzipSync(datos)
  } catch {
    throw new Error('El archivo no es un Excel (.xlsx) válido. Si es .xls viejo, ábrelo y guárdalo como .xlsx.')
  }
  const texto = (ruta: string) => (archivos[ruta] ? strFromU8(archivos[ruta]) : null)
  const libro = texto('xl/workbook.xml')
  if (!libro) throw new Error('El archivo no es un Excel (.xlsx) válido.')

  const compartidos = [...(texto('xl/sharedStrings.xml') ?? '').matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) => textoDe(m[1]))

  // Hojas en el orden del libro → archivo de cada una según las relaciones.
  const rels = new Map<string, string>()
  for (const m of (texto('xl/_rels/workbook.xml.rels') ?? '').matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)) {
    const id = atributo(m[0], 'Id')
    const destino = atributo(m[0], 'Target')
    if (id && destino) rels.set(id, destino.startsWith('/') ? destino.slice(1) : `xl/${destino.replace(/^\.\//, '')}`)
  }
  const hojas: HojaLeida[] = []
  for (const m of libro.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)) {
    const nombre = atributo(m[0], 'name') ?? `Hoja ${hojas.length + 1}`
    const rid = atributo(m[0], 'r:id') ?? atributo(m[0], 'id')
    const ruta = (rid && rels.get(rid)) || `xl/worksheets/sheet${hojas.length + 1}.xml`
    const xml = texto(ruta)
    if (xml) hojas.push({ nombre, filas: leerHoja(xml, compartidos) })
  }
  return hojas
}

/** Lee un CSV. Excel en español lo guarda con punto y coma; se detecta solo. */
export function leerCsv(contenido: string): HojaLeida[] {
  const texto = contenido.replace(/^﻿/, '')
  const primera = texto.split(/\r?\n/, 1)[0] ?? ''
  const sep = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ';' : ','
  const filas: Celda[][] = []
  let fila: Celda[] = []
  let campo = ''
  let comillas = false
  const cerrarCampo = () => {
    fila.push(campo.trim() === '' ? null : campo)
    campo = ''
  }
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]
    if (comillas) {
      if (ch === '"' && texto[i + 1] === '"') {
        campo += '"'
        i++
      } else if (ch === '"') comillas = false
      else campo += ch
    } else if (ch === '"') comillas = true
    else if (ch === sep) cerrarCampo()
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++
      cerrarCampo()
      filas.push(fila)
      fila = []
    } else campo += ch
  }
  if (campo !== '' || fila.length > 0) {
    cerrarCampo()
    filas.push(fila)
  }
  return [{ nombre: 'CSV', filas }]
}

/** Lee un archivo elegido por el usuario (.xlsx o .csv). */
export async function leerArchivo(archivo: File): Promise<HojaLeida[]> {
  const bytes = new Uint8Array(await archivo.arrayBuffer())
  if (/\.csv$/i.test(archivo.name) || archivo.type === 'text/csv') {
    // Excel en Windows guarda el CSV en Windows-1252 (no UTF-8): sin esto se rompen los acentos.
    let texto: string
    try {
      texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      texto = new TextDecoder('windows-1252').decode(bytes)
    }
    return leerCsv(texto)
  }
  return leerXlsx(bytes)
}
