// Purpose: ESLint configuration for the project.
// eslint.config.ts
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    type: 'app',
    typescript: true,
    formatters: true,
    stylistic: {
      indent: 2,
      semi: false,
      quotes: 'single'
    },
    ignores: ['**/migrations/*', 'AGENTS.md', 'CLAUDE.md']
  },
  {
    rules: {
      // one source of truth for trailing commas
      '@stylistic/comma-dangle': ['error', 'never'],
      'comma-dangle': 'off',

      // avoid import sorter ping-pong
      'import/order': 'off',
      'perfectionist/sort-imports': ['error', { tsconfigRootDir: '.' }],

      'no-console': 'warn',
      'antfu/no-top-level-await': 'off',
      'node/prefer-global/process': 'off',
      'node/no-process-env': 'error',
      'unicorn/filename-case': ['error', {
        case: 'kebabCase',
        ignore: ['README.md']
      }]
    }
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: new URL('.', import.meta.url).pathname
      }
    },
    rules: {
      '@typescript-eslint/no-deprecated': 'error'
    }
  }
)
