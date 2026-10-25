import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*', 'release/**/*']
  },
  firebaseRulesPlugin.configs['flat/recommended']
];
