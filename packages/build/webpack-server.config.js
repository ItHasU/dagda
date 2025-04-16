const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
const path = require("path");

function getDependenciesRecursively(packagePath, visited = new Set()) {
  console.log(`Visiting: ${packagePath}`);
  if (visited.has(packagePath)) return [];
  visited.add(packagePath);

  const packageJson = require(packagePath);
  const dependencies = packageJson.dependencies || {};
  const modules = Object.keys(dependencies);

  let allModules = [...modules];

  for (const [dep, version] of Object.entries(dependencies)) {
    if (version === "*") {
      try {
        const depPackagePath = `${dep}/package.json`;
        allModules = [
          ...allModules,
          ...getDependenciesRecursively(depPackagePath, visited),
        ];
      } catch (err) {
        console.warn(`Could not resolve package: ${dep}`);
      }
    } else {
      console.log(`Adding  : ${dep} (${version})`);
      allModules.push(dep);
    }
  }

  return allModules;
}

/** Inspired by https://github.com/appzuka/project-references-example */
function getWebpackConfig(dirname, entry = "src/main.ts", node_modules = getDependenciesRecursively(path.resolve(dirname, "./package.json"))) {
  return {
    mode: "development", // or "production"
    watch: false,
    devtool: "inline-source-map",
    entry: entry,
    output: {
      path: dirname + '/dist',
      filename: "[name].js"
    },
    context: dirname, // to automatically find tsconfig.json
    externalsPresets: { node: true }, // in order to ignore built-in modules like path, fs, etc.
    externalsType: "commonjs",
    externals: node_modules,
    module: {
      "rules": [
        {
          "test": /\.ts?$/,
          "exclude": /node_modules/,
          "use": {
            "loader": "ts-loader",
            "options": {
              "transpileOnly": false, // Set to true if you are using fork-ts-checker-webpack-plugin
              "projectReferences": true
            }
          }
        }
      ]
    },
    resolve: {
      extensions: [".js", ".ts"],
      plugins: [
        new TsconfigPathsPlugin({})
      ]
    },
    plugins: [
    ]
  };

}

module.exports = getWebpackConfig;