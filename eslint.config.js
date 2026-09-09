// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    /**
     * Конфигурационные файлы исполняются НЕ в приложении, а в Node при
     * сборке: у них CommonJS-модули и доступ к `__dirname`, `require`,
     * `process`. Без этой секции линт разбирал их по правилам кода
     * приложения и ругался на `__dirname is not defined` — ошибка, которую
     * нельзя исправить в самом файле, потому что она неверна.
     */
    files: ['*.config.js', 'app.config.js', 'metro.config.js', 'babel.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'writable',
        require: 'readonly',
        process: 'readonly',
      },
    },
  },
]);
