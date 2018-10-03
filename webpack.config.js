// webpack.config.js
var webpack = require('webpack');

module.exports = {
  entry: {
    site: './source/javascripts/site.js'
  },

  output: {
    path: __dirname + '/.tmp/dist',
    filename: 'javascripts/[name].js',
  },
};