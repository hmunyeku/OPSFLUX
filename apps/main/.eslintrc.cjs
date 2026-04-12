/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['react-hooks', '@typescript-eslint'],
  rules: {
    // Relax rules that are too noisy for a large existing codebase
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-empty-pattern': 'warn',
    'prefer-const': 'warn',
    'no-constant-condition': 'warn',
    'no-extra-semi': 'warn',
    'no-empty': ['warn', { allowEmptyCatch: true }],
    'no-inner-declarations': 'warn',
    // TODO: fix conditional hook calls across the codebase, then restore 'error'
    'react-hooks/rules-of-hooks': 'warn',
  },
}
