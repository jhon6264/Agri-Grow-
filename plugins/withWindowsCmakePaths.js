const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withWindowsCmakePaths(config) {
  return withAppBuildGradle(config, (config) => {
    const marker = '// AgriGrow: keep Windows C++ object paths below MAX_PATH.';
    if (config.modResults.contents.includes(marker)) return config;
    config.modResults.contents += `
${marker}
if (System.getProperty('os.name').toLowerCase().contains('windows')) {
    def cacheKey = Integer.toHexString(rootDir.absolutePath.hashCode())
    android.externalNativeBuild.cmake.buildStagingDirectory = new File(System.getProperty('user.home'), ".gradle/cxx/" + cacheKey)
    android.defaultConfig.externalNativeBuild.cmake.arguments "-DCMAKE_OBJECT_PATH_MAX=240"
}
`;
    return config;
  });
};
