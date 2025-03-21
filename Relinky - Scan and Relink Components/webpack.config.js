const InlineChunkHtmlPlugin = require('react-dev-utils/InlineChunkHtmlPlugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');

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
      '@relink': path.resolve(__dirname, 'src/relink'),
      '@unlink': path.resolve(__dirname, 'src/unlink')
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
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'src/ui.html'),
      filename: 'ui.html',
      inject: 'body',
      chunks: ['ui']
    }),
    new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/ui/])
  ],

  stats: {
    children: true,
    errorDetails: true
  }
}); 