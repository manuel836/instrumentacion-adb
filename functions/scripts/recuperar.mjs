// Devuelve a la app lo que se borró por error, copiándolo desde una base recuperada de un
// respaldo (ver docs/respaldos.md). Copia el documento y todo lo que cuelga de él (chat,
// calibraciones, movimientos…). Lo que ya existe en la app no se toca.
//   gcloud auth application-default login
//   GCLOUD_PROJECT=instrumentacion-adb node scripts/recuperar.mjs --tag=PT-101
//   GCLOUD_PROJECT=instrumentacion-adb node scripts/recuperar.mjs instrumentos/abc123 [fallas/xyz …]
// Opciones:
//   --tag=PT-101        el instrumento con ese tag y todas sus fallas (con su chat)
//   --ver               solo dice qué copiaría, sin copiar nada
//   --desde=recuperada  nombre de la base recuperada (por omisión, "recuperada")
// Una ruta con número non de partes ("fallas") copia la colección completa.
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const args = process.argv.slice(2)
const soloVer = args.includes('--ver')
const desde = args.find((a) => a.startsWith('--desde='))?.slice('--desde='.length) ?? 'recuperada'
const tag = args.find((a) => a.startsWith('--tag='))?.slice('--tag='.length).toUpperCase()
const rutas = args.filter((a) => !a.startsWith('--'))
if (rutas.length === 0 && !tag) {
  console.error('Uso: node scripts/recuperar.mjs --tag=PT-101 | instrumentos/<id> [--ver] [--desde=recuperada]')
  process.exit(1)
}

const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT })
const origen = getFirestore(app, desde)
const destino = getFirestore(app)
let copiados = 0
let existentes = 0
/** Carpetas de fotos y documentos de lo que se devolvió (instrumentos/<id>/, fallas/<id>/). */
const carpetas = new Set()

async function copiarDoc(ref) {
  const snap = await ref.get()
  if (snap.exists) {
    const aqui = destino.doc(ref.path)
    if ((await aqui.get()).exists) {
      existentes++
      console.log(`ya está en la app, no se toca: ${ref.path}`)
    } else {
      if (!soloVer) await aqui.set(snap.data())
      copiados++
      if (/^(instrumentos|fallas)\/[^/]+$/.test(ref.path)) carpetas.add(`${ref.path}/`)
      console.log(`${soloVer ? 'copiaría' : 'copiado'}: ${ref.path}`)
    }
  }
  for (const col of await ref.listCollections()) await copiarColeccion(col)
}

async function copiarColeccion(col) {
  for (const ref of await col.listDocuments()) await copiarDoc(ref)
}

if (tag) {
  for (const col of ['instrumentos', 'fallas']) {
    const encontrados = await origen.collection(col).where('tagISA', '==', tag).get()
    if (col === 'instrumentos' && encontrados.empty) console.log(`No hay ningún instrumento ${tag} en la base "${desde}".`)
    rutas.push(...encontrados.docs.map((d) => d.ref.path))
  }
}
for (const ruta of rutas) {
  const partes = ruta.split('/').filter(Boolean)
  if (partes.length % 2 === 0) await copiarDoc(origen.doc(partes.join('/')))
  else await copiarColeccion(origen.collection(partes.join('/')))
}
console.log(`\n${soloVer ? 'Se copiarían' : 'Copiados'}: ${copiados}. Ya estaban en la app: ${existentes}.`)
if (carpetas.size > 0 && !soloVer) {
  console.log('\nPara devolver sus fotos y documentos (si se borraron hace menos de 30 días):')
  for (const c of carpetas) {
    console.log(`gcloud storage restore "gs://${process.env.GCLOUD_PROJECT}.firebasestorage.app/${c}**" --async`)
  }
}
