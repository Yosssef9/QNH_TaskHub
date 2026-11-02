import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { arTranslation } from './locales/ar/translation'
import { enTranslation } from './locales/en/translation'

/** Check source-level translation references; variable-built keys need dedicated coverage. */
function translationKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return prefix ? [prefix] : []
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    translationKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

function allSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) return allSourceFiles(file)
    return /\.tsx?$/.test(entry.name) ? [file] : []
  })
}

function staticTranslationReferences(): Set<string> {
  const sourceDirectory = fileURLToPath(new URL('../', import.meta.url))
  const references = new Set<string>()

  for (const file of allSourceFiles(sourceDirectory)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )

    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node) && node.arguments.length) {
        const expression = node.expression
        const isTranslator =
          (ts.isIdentifier(expression) && expression.text === 't') ||
          (ts.isPropertyAccessExpression(expression) && expression.name.text === 't')
        const argument = node.arguments[0]
        if (isTranslator && argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) {
          references.add(argument.text)
        }
      }
      if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === 'i18nKey' && node.initializer && ts.isStringLiteral(node.initializer)) {
        references.add(node.initializer.text)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }

  return references
}

function isAvailable(key: string, available: Set<string>): boolean {
  // i18next resolves counted keys through locale-specific plural suffixes.
  return available.has(key) || (available.has(`${key}_one`) && available.has(`${key}_other`))
}

const dynamicallyConstructedKeys = [
  // SharedDiscussionPanel builds these from the files/images/links tab values.
  'discussions.sharedFiles',
  'discussions.sharedImages',
  'discussions.sharedLinks',
]

describe('static UI translation references', () => {
  it('resolves every literal translation key and shared-discussion tab in both languages', () => {
    const referenced = new Set([...staticTranslationReferences(), ...dynamicallyConstructedKeys])

    for (const [language, translations] of [
      ['Arabic', arTranslation],
      ['English', enTranslation],
    ] as const) {
      const available = new Set(translationKeys(translations))
      const missing = [...referenced].filter((key) => !isAvailable(key, available)).sort()
      expect(missing, `${language} translations missing:\n${missing.join('\n')}`).toEqual([])
    }
  })
})
