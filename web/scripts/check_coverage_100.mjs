#!/usr/bin/env node
/**
 * coverage_100.toml に登録されたファイルが 100% カバレッジを維持しているか検証する。
 * coverage/coverage-summary.json を読み込み、登録ファイルの lines.pct を確認。
 *
 * Usage: node scripts/check_coverage_100.mjs
 * Exit 0: 全ファイル 100% or 登録ファイルなし
 * Exit 1: 100% 未満のファイルあり
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const TOML_PATH = join(ROOT, 'coverage_100.toml')
const SUMMARY_PATH = join(ROOT, 'coverage', 'coverage-summary.json')

// Parse coverage_100.toml — extract [[files]] path entries
function parseToml(content) {
  const paths = []
  for (const line of content.split('\n')) {
    const match = line.match(/^path\s*=\s*"(.+)"/)
    if (match) paths.push(match[1])
  }
  return paths
}

// Main
const tomlContent = readFileSync(TOML_PATH, 'utf-8')
const registeredFiles = parseToml(tomlContent)

if (registeredFiles.length === 0) {
  console.log('coverage_100.toml: No files registered yet. Skipping check.')
  process.exit(0)
}

if (!existsSync(SUMMARY_PATH)) {
  console.error(`ERROR: ${SUMMARY_PATH} not found. Run "npm run test:coverage" first.`)
  process.exit(1)
}

const summary = JSON.parse(readFileSync(SUMMARY_PATH, 'utf-8'))
let failed = false

for (const filePath of registeredFiles) {
  // coverage-summary.json uses absolute paths as keys
  const absPath = resolve(ROOT, filePath)
  const entry = summary[absPath]

  if (!entry) {
    console.error(`FAIL: ${filePath} — not found in coverage report`)
    failed = true
    continue
  }

  const pct = entry.lines.pct
  if (pct < 100) {
    console.error(`FAIL: ${filePath} — lines ${pct}% (expected 100%)`)
    failed = true
  } else {
    console.log(`  OK: ${filePath} — 100%`)
  }
}

if (failed) {
  console.error('\ncoverage_100 regression detected!')
  process.exit(1)
} else {
  console.log(`\nAll ${registeredFiles.length} registered files at 100%.`)
  process.exit(0)
}
