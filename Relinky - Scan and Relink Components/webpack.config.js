const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');
const path = require('path');

/**
 * Inlines the emitted UI bundle into ui.html so the plugin ships a single,
 * self-contained HTML file. Replaces `react-dev-utils/InlineChunkHtmlPlugin`
 * (that package pulled in a large, unmaintained dependency tree).
 */
class InlineChunkHtmlPlugin {
  constructor(htmlWebpackPlugin, tests) {
    this.htmlWebpackPlugin = htmlWebpackPlugin;
    this.tests = tests;
  }

  getInlinedTag(publicPath, assets, tag) {
    if (tag.tagName !== 'script' || !(tag.attributes && tag.attributes.src)) {
      return tag;
    }
    const scriptName = publicPath
      ? tag.attributes.src.replace(publicPath, '')
      : tag.attributes.src;
    if (!this.tests.some((test) => scriptName.match(test))) {
      return tag;
    }
    const asset = assets[scriptName];
    if (asset == null) {
      return tag;
    }
    return { tagName: 'script', innerHTML: asset.source(), closeTag: true };
  }

  apply(compiler) {
    let publicPath = compiler.options.output.publicPath || '';
    if (publicPath && !publicPath.endsWith('/')) {
      publicPath += '/';
    }

    compiler.hooks.compilation.tap('InlineChunkHtmlPlugin', (compilation) => {
      const tagFunction = (tag) => this.getInlinedTag(publicPath, compilation.assets, tag);
      const hooks = this.htmlWebpackPlugin.getHooks(compilation);

      hooks.alterAssetTagGroups.tap('InlineChunkHtmlPlugin', (assets) => {
        assets.headTags = assets.headTags.map(tagFunction);
        assets.bodyTags = assets.bodyTags.map(tagFunction);
      });

      // Drop the standalone chunk files now that they are inlined
      hooks.afterEmit.tap('InlineChunkHtmlPlugin', () => {
        Object.keys(compilation.assets).forEach((assetName) => {
          if (this.tests.some((test) => assetName.match(test))) {
            if (typeof compilation.deleteAsset === 'function') {
              compilation.deleteAsset(assetName);
            } else {
              delete compilation.assets[assetName];
            }
          }
        });
      });
    });
  }
}

module.exports = (env, argv) => ({
  mode: argv.mode === 'production' ? 'production' : 'development',

  // This is necessary because Figma's 'eval' works differently than normal eval
  devtool: argv.mode === 'production' ? false : 'inline-source-map',

  entry: {
    code: path.resolve(__dirname, 'src/code.ts'),
    ui: path.resolve(__dirname, 'src/ui.js'),
  },

  module: {
    rules: [
      // Converts TypeScript code to JavaScript
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },

      // Enables including CSS by doing "import './file.css'"
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },

      // Handle HTML files
      {
        test: /\.html$/,
        use: [
          {
            loader: 'html-loader',
            options: { minimize: false }
          }
        ]
      }
    ],
  },

  // Webpack tries these extensions for you if you omit the extension like "import './file'"
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
    alias: {
      '@actions': path.resolve(__dirname, 'src/actions'),
      // The UI uses in-DOM / string templates, so it needs the build that
      // includes the runtime template compiler.
      vue$: 'vue/dist/vue.esm-bundler.js'
    }
  },

  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, './dist'), // Output to dist folder
    clean: true, // Clean the output directory before emit
    publicPath: '',
  },

  // Tells Webpack to generate "ui.html" and to inline "ui.js" into it
  plugins: [
    // Vue esm-bundler feature flags (silences warnings and enables tree-shaking)
    new webpack.DefinePlugin({
      __VUE_OPTIONS_API__: JSON.stringify(true),
      __VUE_PROD_DEVTOOLS__: JSON.stringify(false),
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: JSON.stringify(false)
    }),
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'src/ui.html'),
      filename: 'ui.html',
      inject: 'body',
      chunks: ['ui']
    }),
    new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/^ui\.js$/])
  ],

  // The UI bundle is intentionally a single self-contained HTML file, so the
  // default asset size hints are not meaningful here.
  performance: {
    hints: false
  },

  stats: {
    children: true,
    errorDetails: true
  }
});
