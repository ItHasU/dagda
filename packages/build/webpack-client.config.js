const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
const CopyWebpackPlugin = require("copy-webpack-plugin");
// Optional: an app that never touches Monaco (ROADMAP tranche 4) has no
// reason to install this build-only plugin. Only `require()`d if present,
// so its absence is not a build failure for such an app.
let MonacoWebpackPlugin = null;
try {
  MonacoWebpackPlugin = require("monaco-editor-webpack-plugin");
} catch {
  // Not installed: Monaco support in this build is simply left off below.
}

/** Inspired by https://github.com/appzuka/project-references-example */
function getWebpackConfig(dirname, entry = "src/index.ts", assets = "assets/") {
  return {
    mode: "development", // or "production"
    devtool: "inline-source-map",
    entry: entry,
    output: {
      path: dirname + '/dist',
      filename: "[name].js"
    },
    watch: false,
    context: dirname, // to automatically find tsconfig.json
    module: {
      rules: [
        {
          // `.tsc-build/*.d.ts` is read as text by the rule below (Monaco's
          // `loadExtraLibs()`, ROADMAP tranche 4) — excluded here so ts-loader
          // never also claims it, which `test: /\.ts?$/` alone would do.
          test: /\.ts?$/,
          exclude: [/node_modules/, /\.tsc-build/],
          use: {
            loader: "ts-loader",
            options: {
              transpileOnly: false, // Set to true if you are using fork-ts-checker-webpack-plugin
              projectReferences: true
            }
          }
        },
        {
          // The already-emitted `.d.ts` of the application's own actions and
          // entities, embedded as plain text so `MonacoService.loadExtraLibs()`
          // can feed it to `addExtraLib()` for real autocompletion on the
          // application's actual API — not compiled, just read.
          test: /\.tsc-build[\\/].*\.d\.ts$/,
          type: "asset/source",
        },
        {
          test: /\.html$/i,
          loader: "html-loader",
          options: {
            sources: {
              list: [
                "...",
                {
                  tag: "link",
                  attribute: "href",
                  type: "src",
                  filter: (tag, attribute, attributes, resourcePath) => {
                    const imgPath = attributes[1].value;
                    return !imgPath.startsWith("/" + assets);
                  },
                },
              ],
            },
          }
        },
        {
          test: /\.css$/i,
          use: ["style-loader", "css-loader"],
        },
        {
          // Fonts vendored by the framework (text and icons), plus Monaco's
          // own `codicon.ttf` (ROADMAP tranche 4) once it's installed — missed,
          // every editor glyph in the dashboard's code editor renders as a
          // box. Referenced by url() from the stylesheets, never imported
          // from code, and emitted next to the bundle. Webpack 5 asset
          // modules do this on their own: no loader to install.
          test: /\.(woff2|ttf)$/i,
          type: "asset/resource",
        },
      ]
    },
    resolve: {
      modules: [
        "node_modules",
        path.resolve(dirname)
      ],
      // TsconfigPathsPlugin will automatically add this
      // alias: {
      //   packages: path.resolve(__dirname, 'packages/'),
      // },
      extensions: [".js", ".ts"],
      plugins: [
        new TsconfigPathsPlugin({}),
      ],
      alias: {
        handlebars: 'handlebars/dist/handlebars.min.js'
      }
    },
    plugins: [
      new HtmlWebpackPlugin({ template: "src/index.html" }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: path.resolve(dirname, assets),
            to: "assets"
          }
        ]
      }),
      // Without this, Monaco's language services (syntax highlighting,
      // Ctrl+Space) fall back to the main thread instead of a web worker —
      // still functional, just janky on a large document. Only added when
      // the app installed the plugin (see the require() above).
      ...(MonacoWebpackPlugin != null ? [new MonacoWebpackPlugin({
        // Only the languages the framework actually uses an editor for
        // (ROADMAP tranche 4: dashboards' HTML, later the script/automation
        // editors' TypeScript) — the full default list pulls in every
        // language Monaco ships, most of which no Dagda app will ever open.
        languages: ["html", "typescript", "javascript"]
      })] : [])
    ]
  };

}

module.exports = getWebpackConfig;