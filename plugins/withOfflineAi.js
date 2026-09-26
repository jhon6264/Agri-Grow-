const { withGradleProperties, withAndroidManifest, withProjectBuildGradle } = require('expo/config-plugins');
module.exports = function withOfflineAi(config) {
  config = withProjectBuildGradle(config, (mod) => {
    // The version-catalog property alone does not replace the Kotlin compiler
    // already contributed by React Native's root buildscript classpath.
    mod.modResults.contents = mod.modResults.contents.replace(
      /classpath\(['"]org\.jetbrains\.kotlin:kotlin-gradle-plugin(?::[^'"]+)?['"]\)/g,
      "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin:2.3.20')",
    );
    return mod;
  });
  config = withGradleProperties(config, (mod) => {
    for (const [key, value] of Object.entries({ 'android.minSdkVersion': '33', 'android.kotlinVersion': '2.3.20', reactNativeArchitectures: 'arm64-v8a' })) {
      mod.modResults = mod.modResults.filter((entry) => entry.key !== key);
      mod.modResults.push({ type: 'property', key, value });
    }
    return mod;
  });
  return withAndroidManifest(config, (mod) => {
    // Offline model and private photos must never enter Android cloud/device backups.
    mod.modResults.manifest.application[0].$['android:allowBackup'] = 'false';
    return mod;
  });
};
