/**
 * @file: scripts/check-expo-deps.mjs
 * @description:
 *   Проверка совместимости Expo-модулей с установленным SDK.
 *
 *   ЗАЧЕМ (v1.5.8): в v1.5.6 пакет `expo-keep-awake` добавили обычным
 *   `npm install` вместо `npx expo install`. Встала версия ^57.0.1 при
 *   SDK 55 — модуль на два мажора выше. Это НЕ ловится ничем из обычного:
 *     - npm молчит, потому что у пакета `peerDependencies: { expo: "*" }`;
 *     - typecheck и lint проходят — расхождение в нативной части;
 *     - CI собирает APK успешно.
 *   Приложение падало уже на устройстве, сразу при запуске:
 *     java.lang.NoClassDefFoundError: Lexpo/modules/kotlin/types/AnyTypeCache
 *       at expo.modules.keepawake.KeepAwakeModule.definition(KeepAwakeModule.kt:48)
 *   (`useKeepAwake()` вызывается в корневом app/_layout.tsx).
 *
 *   ПОЧЕМУ НЕ ПРОСТО `expo install --check`: та команда возвращает exit 1
 *   на ЛЮБОМ расхождении, включая патч-версии. На момент написания так
 *   отставали 20 пакетов — все безобидно. Блокирующий шаг из-за патчей
 *   сделал бы CI постоянно красным, и его перестали бы читать.
 *
 *   Поэтому здесь: расхождение в МАЖОРЕ (для 0.x — в миноре, там мажор
 *   ничего не значит) — ошибка и выход 1; расхождение в патче — печатаем
 *   как справку и выходим 0.
 *
 * @dependencies: node:child_process (вызывает `expo install --check`)
 * @created: 2026-08-27 (v1.5.8)
 */

import { spawnSync } from 'node:child_process';
import process from 'node:process';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  gray: '\x1b[90m',
  cyan: '\x1b[36m',
};

/** Строка отчёта expo: `  expo-keep-awake@57.0.1 - expected version: ~55.0.8` */
const LINE_RE = /^\s+(\S+)@(\S+)\s+-\s+expected version:\s+(\S+)\s*$/;

/** Убирает диапазонные префиксы (~, ^, >=) и возвращает [major, minor]. */
function parseVersion(raw) {
  const cleaned = String(raw).replace(/^[~^>=<\s]+/, '');
  const [major, minor] = cleaned.split('.');
  return [Number(major), Number(minor)];
}

/**
 * Совместимы ли версии по «значащему» разряду.
 *
 * Для 0.x весь контракт держится на миноре (react-native 0.83 → 0.84 это
 * ломающее обновление), поэтому там сравниваем минор.
 */
function isBreaking(installed, expected) {
  const [iMajor, iMinor] = parseVersion(installed);
  const [eMajor, eMinor] = parseVersion(expected);
  if (!Number.isFinite(iMajor) || !Number.isFinite(eMajor)) return false;
  if (iMajor !== eMajor) return true;
  if (iMajor === 0) return iMinor !== eMinor;
  return false;
}

// Не используем `shell: true` — Node 22+ ругается DEP0190 (аргументы не
// экранируются). На Windows явно вызываем cmd.exe, чтобы отработал
// npx.cmd-шим; на POSIX — обычный spawn. Тот же приём, что и в
// scripts/run-with-env.mjs основного репозитория.
const res =
  process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npx expo install --check'], { encoding: 'utf8' })
    : spawnSync('npx', ['expo', 'install', '--check'], { encoding: 'utf8' });

const output = `${res.stdout ?? ''}${res.stderr ?? ''}`;

// Команда недоступна (нет node_modules / expo не установлен) — это не наш
// профиль ошибки, но и молча пропускать нельзя.
if (res.error) {
  console.error(`${C.red}Не удалось запустить \`expo install --check\`: ${res.error.message}${C.reset}`);
  process.exit(1);
}

const mismatches = [];
for (const line of output.split(/\r?\n/)) {
  const m = LINE_RE.exec(line);
  if (!m) continue;
  const [, name, installed, expected] = m;
  mismatches.push({ name, installed, expected, breaking: isBreaking(installed, expected) });
}

const breaking = mismatches.filter((x) => x.breaking);
const minor = mismatches.filter((x) => !x.breaking);

if (breaking.length > 0) {
  console.error(
    `\n${C.red}${C.bold}✗ Несовместимые версии Expo-модулей${C.reset}\n\n` +
      `  Эти пакеты собраны под ДРУГУЮ версию SDK. APK соберётся, но\n` +
      `  приложение упадёт на устройстве при запуске:\n`,
  );
  for (const x of breaking) {
    console.error(`    ${C.bold}${x.name}${C.reset}  ${C.red}${x.installed}${C.reset} → нужно ${C.green}${x.expected}${C.reset}`);
  }
  console.error(
    `\n  ${C.bold}Как исправить:${C.reset}\n` +
      `    ${C.cyan}npx expo install ${breaking.map((x) => x.name).join(' ')}${C.reset}\n` +
      `    ${C.gray}(обычный \`npm install\` ставит latest и не смотрит на версию SDK)${C.reset}\n` +
      `\n  ${C.gray}Затем обязательно закоммитить package-lock.json — CI ставит зависимости\n` +
      `  через \`npm ci\`, то есть по lock-файлу.${C.reset}\n`,
  );
  process.exit(1);
}

if (minor.length > 0) {
  console.log(
    `${C.yellow}Отстают по патч-версии (${minor.length}), сборку не блокирует:${C.reset}\n` +
      minor.map((x) => `${C.gray}  ${x.name} ${x.installed} → ${x.expected}${C.reset}`).join('\n') +
      `\n${C.gray}Подтянуть при случае: npx expo install --fix${C.reset}\n`,
  );
}

console.log(`${C.green}✓ Несовместимых по мажору Expo-модулей нет${C.reset}`);
