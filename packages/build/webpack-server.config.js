const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
const path = require("path");

/**
 * A dependency pointing at a package of the same project rather than at the
 * registry.
 *
 * `*` covers the packages of a single npm workspace; `file:` and `link:` cover
 * an application living in its own repository next to the framework, which is
 * the normal case as soon as Dagda is used outside its own tree.
 */
function isLocalPackage(version) {
  return version === "*"
    || version.startsWith("file:")
    || version.startsWith("link:")
    || version.startsWith("workspace:");
}

/**
 * Collects the node modules the server bundle must NOT embed.
 *
 * Only what the bundled package declares itself, and only from the registry:
 * those sit in its own node_modules and are resolvable at runtime.
 *
 * Everything reached *through* a local package is bundled instead. An
 * application linking the framework from another repository cannot resolve the
 * framework's own dependencies at runtime — npm installs them next to the
 * framework, not next to the application — so externalising them yields a
 * bundle that builds fine and dies on "Cannot find module 'express'".
 *
 * Bundling them is only safe because the config sets `target: "node"`; without
 * it webpack would pick the "browser" entry of packages like `ws`.
 */
/**
 * Optional native add-ons that `pg` and `ws` require inside a try/catch to go
 * faster when they happen to be installed. They are not dependencies, so
 * bundling them fails; left external, the try/catch does its job.
 */
const OPTIONAL_NATIVE_MODULES = ["pg-native", "bufferutil", "utf-8-validate"];

function getExternalModules(packagePath) {
  const dependencies = require(packagePath).dependencies || {};
  return [
    ...Object.entries(dependencies)
      .filter(([, version]) => !isLocalPackage(version))
      .map(([dep]) => dep),
    ...OPTIONAL_NATIVE_MODULES
  ];
}

/** Inspired by https://github.com/appzuka/project-references-example */
function getWebpackConfig(dirname, entry = "src/main.ts", node_modules = getExternalModules(path.resolve(dirname, "./package.json"))) {
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
    // Without this the default target is "web", so resolve.mainFields prefers the
    // "browser" entry of a package. That is how a bundled `ws` became a stub
    // throwing "WebSocketServer is not a constructor" at the first connection.
    target: "node",
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