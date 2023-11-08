const tsConfig = require('./tsconfig.json');
const tsConfigPaths = require('tsconfig-paths');

const { outDir, paths } = tsConfig.compilerOptions;

tsConfigPaths.register({
  baseUrl: outDir,
  paths: paths,
});
