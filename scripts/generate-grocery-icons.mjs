#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const INPUT_CSV = '/Users/saynode/Downloads/europe_grocery_top2000_estimated.csv'
const LIMIT = 10
const OUT_ROOT = path.resolve('assets/grocery-icons')
const OUT_SVG = path.join(OUT_ROOT, 'svg')
const OUT_PNG = path.join(OUT_ROOT, 'png', '128')

function parseCsvLine(line) {
  const fields = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === ',' && !inQuotes) {
      fields.push(current)
      current = ''
      continue
    }
    current += ch
  }
  fields.push(current)
  return fields
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0]).map((h) => h.trim())
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line)
    const row = {}
    for (let i = 0; i < headers.length; i++) row[headers[i]] = (cols[i] || '').trim()
    return row
  })
}

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function wrapSvg(inner) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  ${inner}
</svg>
`
}

function iconFor(item) {
  const key = item.toLowerCase()
  const icons = {
    apples: `
  <path d="M64 14 C72 14,77 20,77 28 C89 32,99 46,99 62 C99 89,82 112,64 114 C46 112,29 89,29 62 C29 46,39 32,51 28 C51 20,56 14,64 14 Z" fill="#D6453A"/>
  <ellipse cx="48" cy="31" rx="13" ry="8" fill="#3B9E4D" transform="rotate(-30 48 31)"/>
  <rect x="61" y="16" width="6" height="14" rx="3" fill="#6A4228"/>
    `,
    asparagus: `
  <rect x="18" y="18" width="14" height="96" rx="6" fill="#50B56B"/>
  <rect x="39" y="12" width="14" height="102" rx="6" fill="#3FA45A"/>
  <rect x="60" y="18" width="14" height="96" rx="6" fill="#50B56B"/>
  <rect x="81" y="14" width="14" height="100" rx="6" fill="#3FA45A"/>
  <polygon points="25,4 14,18 36,18" fill="#2F8F4C"/>
  <polygon points="46,0 35,14 57,14" fill="#2F8F4C"/>
  <polygon points="67,4 56,18 78,18" fill="#2F8F4C"/>
  <polygon points="88,0 77,14 99,14" fill="#2F8F4C"/>
    `,
    avocado: `
  <path d="M64 4 C88 4,108 26,108 56 C108 93,89 122,64 124 C39 122,20 93,20 56 C20 26,40 4,64 4 Z" fill="#4BAF55"/>
  <path d="M64 20 C82 20,97 37,97 59 C97 86,82 106,64 108 C46 106,31 86,31 59 C31 37,46 20,64 20 Z" fill="#B9E08F"/>
  <circle cx="64" cy="69" r="18" fill="#8E5D3A"/>
    `,
    bananas: `
  <path d="M8 88 C28 116,79 124,118 96 C108 109,89 118,67 118 C42 118,20 106,8 88 Z" fill="#E9B92F"/>
  <path d="M10 72 C32 98,79 106,113 82 C104 93,87 101,67 101 C43 101,22 91,10 72 Z" fill="#F8CC46"/>
  <circle cx="9" cy="89" r="4" fill="#7B5A35"/>
  <circle cx="116" cy="97" r="4" fill="#7B5A35"/>
    `,
    beetroot: `
  <path d="M64 22 C89 22,108 44,108 68 C108 96,88 119,64 122 C40 119,20 96,20 68 C20 44,39 22,64 22 Z" fill="#A02C65"/>
  <path d="M64 122 L52 128 L64 128 L76 128 Z" fill="#7D214E"/>
  <ellipse cx="44" cy="14" rx="14" ry="8" fill="#3D9F58" transform="rotate(-28 44 14)"/>
  <ellipse cx="64" cy="10" rx="14" ry="8" fill="#3D9F58"/>
  <ellipse cx="84" cy="14" rx="14" ry="8" fill="#3D9F58" transform="rotate(28 84 14)"/>
    `,
    'bell peppers': `
  <path d="M64 8 C80 8,90 19,90 32 C102 39,110 53,110 73 C110 103,88 124,64 124 C40 124,18 103,18 73 C18 53,26 39,38 32 C38 19,48 8,64 8 Z" fill="#D93A35"/>
  <rect x="58" y="0" width="12" height="14" rx="4" fill="#2E7D3C"/>
  <path d="M42 38 C47 30,56 26,64 26 C72 26,81 30,86 38" stroke="#BA2F2B" stroke-width="5" fill="none"/>
    `,
    blueberries: `
  <circle cx="42" cy="76" r="28" fill="#4A67D1"/>
  <circle cx="84" cy="76" r="28" fill="#3855BD"/>
  <circle cx="63" cy="43" r="28" fill="#5A76DF"/>
  <circle cx="63" cy="43" r="7" fill="#2C3C91"/>
  <circle cx="42" cy="76" r="6" fill="#2C3C91"/>
  <circle cx="84" cy="76" r="6" fill="#2C3C91"/>
    `,
    broccoli: `
  <rect x="50" y="66" width="28" height="58" rx="10" fill="#5A8C40"/>
  <circle cx="34" cy="56" r="24" fill="#3D9F4D"/>
  <circle cx="54" cy="44" r="27" fill="#4AAE59"/>
  <circle cx="76" cy="42" r="27" fill="#4AAE59"/>
  <circle cx="96" cy="56" r="24" fill="#3D9F4D"/>
  <circle cx="64" cy="30" r="22" fill="#44A954"/>
    `,
    cabbage: `
  <circle cx="64" cy="68" r="56" fill="#8CCD79"/>
  <path d="M28 66 C44 46,83 44,100 63" stroke="#5E9F5B" stroke-width="6" fill="none"/>
  <path d="M24 82 C44 72,80 73,104 93" stroke="#5E9F5B" stroke-width="6" fill="none"/>
  <path d="M64 18 C57 36,57 98,64 118" stroke="#5E9F5B" stroke-width="6" fill="none"/>
  <path d="M40 30 C51 52,49 86,36 104" stroke="#5E9F5B" stroke-width="5" fill="none"/>
  <path d="M88 30 C77 52,79 86,92 104" stroke="#5E9F5B" stroke-width="5" fill="none"/>
    `,
    carrots: `
  <path d="M42 22 L68 122 L20 122 Z" fill="#F08B25"/>
  <path d="M86 12 L114 116 L66 116 Z" fill="#E37A1E"/>
  <ellipse cx="42" cy="18" rx="14" ry="8" fill="#3DA250" transform="rotate(-25 42 18)"/>
  <ellipse cx="61" cy="14" rx="14" ry="8" fill="#3DA250" transform="rotate(10 61 14)"/>
  <ellipse cx="84" cy="8" rx="14" ry="8" fill="#3DA250" transform="rotate(-15 84 8)"/>
  <ellipse cx="102" cy="8" rx="14" ry="8" fill="#3DA250" transform="rotate(20 102 8)"/>
    `
  }

  const generic = `
  <circle cx="64" cy="70" r="52" fill="#64B96A"/>
  <rect x="60" y="12" width="8" height="20" rx="4" fill="#3D7A43"/>
  `

  return wrapSvg(icons[key] || generic)
}

async function ensureDirs() {
  await fs.mkdir(OUT_SVG, { recursive: true })
  await fs.mkdir(OUT_PNG, { recursive: true })
}

async function renderPng(svgPath, pngPath) {
  const outDir = path.dirname(pngPath)
  const quicklookName = `${path.basename(svgPath)}.png`
  const quicklookPath = path.join(outDir, quicklookName)
  await execFileAsync('qlmanage', ['-t', '-s', '128', '-o', outDir, svgPath])
  await fs.rename(quicklookPath, pngPath)
}

async function main() {
  await ensureDirs()
  const csv = await fs.readFile(INPUT_CSV, 'utf8')
  const rows = parseCsv(csv).slice(0, LIMIT)

  if (rows.length === 0) {
    throw new Error('No rows found in CSV.')
  }

  const manifest = []
  for (const row of rows) {
    const item = row.item
    const slug = slugify(item)
    const svgPath = path.join(OUT_SVG, `${slug}.svg`)
    const pngPath = path.join(OUT_PNG, `${slug}.png`)
    const svg = iconFor(item)
    await fs.writeFile(svgPath, svg, 'utf8')
    await renderPng(svgPath, pngPath)
    manifest.push({ rank: row.rank, category: row.category, item, slug, svgPath, pngPath })
  }

  const manifestPath = path.join(OUT_ROOT, 'manifest-first-10.json')
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  console.log(`Generated ${manifest.length} icons.`)
  console.log(`Manifest: ${manifestPath}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
