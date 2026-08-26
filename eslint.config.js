// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // supabase/functions je Deno kod (ne deo RN aplikacije) — drugi runtime i globali.
    ignores: ['dist/*', 'supabase/functions/**'],
  },
]);
