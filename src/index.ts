import { join } from 'node:path'
import type { Plugin } from 'vite'
import { globSync } from 'fast-glob'
import { pascalCase, requireJson } from './utils'
import { writeFileSync } from 'node:fs'

export interface EasycomOptions {
  dts?: string
}

const pluginEasycom = (opts: EasycomOptions = {}): Plugin => {
  const resolvedOptions = {
    root: process.cwd(),
    dts: opts.dts || 'src/easycom.d.ts',
    easycom: {} as Record<string, string>,
  }

  const easycomMap = new Map<string, string>()

  const generateDts = () => {
    const filename = join(resolvedOptions.root, resolvedOptions.dts)
    const components: string[] = []
    for (const [name, url] of easycomMap.entries()) {
      components.push(
        `    ${pascalCase(name)}: (typeof import('${url}'))['default']`,
      )
    }

    const content = [
      '/* eslint-disable */',
      '/* prettier-ignore */',
      '// @ts-nocheck',
      '// noinspection JSUnusedGlobalSymbols',
      '// Generated by uniapp-easycom',
      '// biome-ignore lint: disable',
      'export {}',
      "declare module 'vue' {",
      '  export interface GlobalComponents {',
      ...components,
      '  }',
      '}',
    ]
    writeFileSync(filename, content.join('\n'), 'utf-8')
  }

  return {
    name: 'uniapp-easycom',
    configResolved(config) {
      const root = config.root
      resolvedOptions.root = root

      const pagesJsonPath = join(root, 'src/pages.json')
      const pagesJson = requireJson<any>(pagesJsonPath, {})

      const customEasycom = pagesJson.easycom?.custom ?? {}

      for (const key in customEasycom) {
        if (Object.prototype.hasOwnProperty.call(customEasycom, key)) {
          const pattern = customEasycom[key]

          if (pattern.startsWith('@/')) {
            customEasycom[key] = pattern.replace('@/', 'src/')
          } else if (pattern.startsWith('./')) {
            customEasycom[key] = pattern.replace('./', 'src/')
          } else if (pattern.startsWith('../')) {
            customEasycom[key] = pattern.replace('../', '')
          } else {
            customEasycom[key] = `node_modules/${pattern}`
          }
        }
      }

      Object.assign(customEasycom, {
        '^(.*)$': 'components/$1/$1.vue',
      })

      resolvedOptions.easycom = customEasycom
    },
    async buildStart() {
      const { root, easycom } = resolvedOptions

      for (const [name, pattern] of Object.entries(easycom)) {
        const globPattern = pattern.replace(/\$\d+/g, '*')
        const files = globSync(globPattern, {
          cwd: root,
        })

        const regexp = new RegExp(pattern.replace(/\$\d+/g, '(.*)'))
        for (const filename of files) {
          const matches = regexp.exec(filename)
          if (matches) {
            const [importUrl, ...matchNames] = matches

            let replaceIndex = 0
            let componentName = name
            componentName = componentName.replace(/(\(.*?\))/g, () => {
              return matchNames[replaceIndex++]
            })
            componentName = componentName.replace(/^\^/g, '')
            componentName = componentName.replace(/\$$/g, '')

            const componentUrl = pattern.replace(/\$\d+/g, (m) => {
              const [, index] = /\$(\d+)/.exec(m) ?? [, '1']
              return matchNames[parseInt(index) - 1]
            })

            if (componentUrl === importUrl) {
              easycomMap.set(componentName, componentUrl)
            }
          }
        }
      }

      generateDts()
    },
  }
}

export default pluginEasycom
