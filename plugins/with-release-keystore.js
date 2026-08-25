/**
 * @file: plugins/with-release-keystore.js
 * @description:
 *   Expo config plugin — постоянный release keystore.
 *   При каждом `expo prebuild` (в т.ч. --clean) правит `android/app/build.gradle`:
 *     1) добавляет чтение <projectRoot>/keystore.properties
 *     2) добавляет signingConfigs.release
 *     3) меняет buildTypes.release → signingConfigs.release (fallback на debug если keystore.properties отсутствует)
 *
 *   Файлы `keystore.properties` и папка `keystore/` — в .gitignore, генерируются
 *   руками через keytool (см. docs/RELEASE_KEYSTORE.md, если появится).
 *
 * @created: 2026-08-25
 */

const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

const READ_PROPS_MARKER = 'TAXI_SPHERE_UPLOAD_STORE_FILE';

const READ_PROPS_SNIPPET = `

// [taxi-sphere-driver keystore] managed by plugins/with-release-keystore.js
def keystoreProperties = new java.util.Properties()
def keystorePropertiesFile = file("\${rootProject.projectDir}/../keystore.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new java.io.FileInputStream(keystorePropertiesFile))
}
`;

const RELEASE_SIGNING_SNIPPET = `        release {
            if (keystoreProperties['TAXI_SPHERE_UPLOAD_STORE_FILE']) {
                storeFile rootProject.file(keystoreProperties['TAXI_SPHERE_UPLOAD_STORE_FILE'])
                storePassword keystoreProperties['TAXI_SPHERE_UPLOAD_STORE_PASSWORD']
                keyAlias keystoreProperties['TAXI_SPHERE_UPLOAD_KEY_ALIAS']
                keyPassword keystoreProperties['TAXI_SPHERE_UPLOAD_KEY_PASSWORD']
            }
        }
    }`;

/**
 * Правит android/gradle.properties: поднимает JVM heap и Metaspace для gradle
 * daemon. Дефолт (Xmx=2G, MaxMetaspaceSize=512m) недостаточен для release
 * assembleRelease с newArchEnabled=true и множеством KSP-процессоров —
 * expo-updates:kspReleaseKotlin падает с OOM Metaspace. Значения соответствуют
 * рекомендациям Expo/RN для CI с ubuntu-latest (7 GB RAM).
 */
function bumpGradleJvmArgs(config) {
  return withGradleProperties(config, (cfg) => {
    const KEY = 'org.gradle.jvmargs';
    const VALUE = '-Xmx6144m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8';
    const props = cfg.modResults;
    const existing = props.find(
      (p) => p.type === 'property' && p.key === KEY,
    );
    if (existing) {
      existing.value = VALUE;
    } else {
      props.push({ type: 'property', key: KEY, value: VALUE });
    }
    return cfg;
  });
}

module.exports = function withReleaseKeystore(config) {
  config = bumpGradleJvmArgs(config);
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;

    // 1) вставляем чтение properties перед блоком android {} (идемпотентно)
    if (!src.includes(READ_PROPS_MARKER)) {
      src = src.replace(/(\nandroid\s*\{)/, `${READ_PROPS_SNIPPET}$1`);
    }

    // 2) добавляем signingConfigs.release после блока debug {} внутри signingConfigs
    //    Идемпотентность по маркеру константы, т.к. вложенные скобки regex не парсит.
    if (!src.includes(`storeFile rootProject.file(keystoreProperties['${READ_PROPS_MARKER}']`)) {
      src = src.replace(
        /(signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\}\s*)\}/,
        `$1\n${RELEASE_SIGNING_SNIPPET}`,
      );
    }

    // 3) переключаем buildTypes.release с debug на release (с fallback)
    src = src.replace(
      /release\s*\{\s*\n(\s*\/\/[^\n]*\n)*\s*signingConfig\s+signingConfigs\.debug/,
      `release {
            signingConfig keystoreProperties['TAXI_SPHERE_UPLOAD_STORE_FILE'] ? signingConfigs.release : signingConfigs.debug`,
    );

    cfg.modResults.contents = src;
    return cfg;
  });
};
