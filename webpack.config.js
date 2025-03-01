// Note we use cache-loader; it is caching files in node_modules/.cache.
//
const fs = require('fs');
const path = require('path');
const webpack = require('webpack');

const CopyWebpackPlugin = require('copy-webpack-plugin');
const CssExtractPlugin = require('mini-css-extract-plugin');
const SpritesmithPlugin = require('webpack-spritesmith');

// List available locales, to fetch only the required locales from Moment.JS:
// Build a regexp that selects the locale's name without the JS extension (due
// to the way moment includes those) and ensure that's the last character to
// not include locale variants. See discussion in
// https://framagit.org/kresusapp/kresus/merge_requests/448#note_130514
const locales = fs.readdirSync('shared/locales').map(
    x => x.replace('.json', '')
);
const localesRegex = new RegExp(
    '(' + locales.join('|') + ')$'
);

let entry = {
    main: [
        'core-js/stable',
        'regenerator-runtime/runtime',
        './client/init.tsx'
    ],
};

// These extra locales should be put after the main client entrypoint to ensure
// that all the scripts are loaded and `window` is populated before trying to
// append locales to these objects.
locales.forEach(locale => {
    if (locale !== 'en') {
        // Flatpickr locales entries
        entry.main.push(`flatpickr/dist/l10n/${locale}.js`);
    }
});

let threadLoaderOptions = {};
if (process.env.WEBPACK_DEV_SERVER) {
    // In watch mode, keep the workers alive.
    threadLoaderOptions.poolTimeout = Infinity;
}

// Webpack config.
const config = {
    mode: process.env.NODE_ENV === "production" ? "production" : "development",

    stats: "errors-warnings",

    entry: entry,

    output: {
        path: path.resolve(__dirname, 'build', 'client'),
        filename: '[name].js',
        publicPath: process.env.ASSET_PATH || '/'
    },

    module: {
        rules: [
            {
                test: /\.js$/,

                // Exclude all but dygraphs
                // Dygraphs ships ES5 files with arrow functions by default, so
                // we need to pass Babel on them
                exclude: /node_modules(?!\/dygraphs)/,
                use: [
                    'cache-loader',
                    {
                        loader: 'thread-loader',
                        options: threadLoaderOptions
                    },
                    'babel-loader'
                ]
            },

            {
                test: /\.tsx?$/,
                exclude: /node_modules/,

                use: [
                    'cache-loader',
                    {
                        loader: 'thread-loader',
                        options: threadLoaderOptions
                    },
                    {
                        loader: 'ts-loader',
                        options: {
                            // Allow parallel processing, and reduce amount of diagnostic.
                            happyPackMode: true,

                            // Transpile only the files passed to the loader.
                            onlyCompileBundledFiles: true,

                            configFile: path.resolve('./client/tsconfig.json'),

                            // Override some of the options in the config file to fit to its use
                            // with ts-loader.
                            compilerOptions: {
                                checkJs: false, // We don't want JS files to be checked by webpack.
                                noEmit: false, // tsc needs to emit the JS files back to ts-loader.
                                incremental: true, // necessary because ts-loader defines a cache file.
                            },
                        }
                    }
                ]

            },

            {
                // Do not use the built-in json loader: we modify the content on the fly and
                // return JS.
                test: /\.json$/,
                include: /shared\/locales/,
                type: "javascript/auto",
                use: [
                    {
                        loader: 'json-strip-loader',
                        options: {
                            key: 'server',
                            deep: false
                        }
                    }
                ]
            },

            {
                test: /\.css$/,
                use: [
                    CssExtractPlugin.loader,
                    "css-loader"
                ]
            },

            {
                test: /\.(jpe?g|png|gif|svg)$/i,
                use: [
                    {
                        loader: 'file-loader',
                        options: {
                            name: 'assets/images/[sha512:hash:hex].[ext]'
                        }
                    },
                    {
                        loader: 'image-webpack-loader',
                        options: {
                            bypassOnDebug: true,
                            'optipng': {
                                optimizationLevel: 7
                            },
                            'gifsicle': {
                                interlaced: false
                            }
                        }
                    }
                ]
            },

            {
                test: /\.woff2?(\?v=[0-9]\.[0-9]\.[0-9])?$/,
                use: [
                    {
                        loader: 'url-loader',
                        options: {
                            limit: 10000,
                            mimetype: 'application/font-woff',
                            name: 'assets/fonts/[name]-[hash:16].[ext]'
                        }
                    }
                ]
            },

            {
                test: /\.(ttf|otf|eot|svg)(\?v=[0-9]\.[0-9]\.[0-9])?$/,
                use: [
                    {
                        loader: 'file-loader',
                        options: {
                            name: 'assets/fonts/[name]-[hash:16].[ext]'
                        }
                    }
                ]
            }
        ]
    },

    devServer: {
        disableHostCheck: true,
        host: "0.0.0.0",
        proxy: {
            "/api": {
                target: "http://localhost:9876/",
                proxyTimeout: 5 * 60 * 1000,
                onProxyReq: (_proxyReq, req, _res) => req.setTimeout(5 * 60 * 1000)
            },
            "/manifest": "http://localhost:9876/"
        }
    },

    resolve: {
        extensions: ['.ts', '.js', '.tsx'],
        modules: ['node_modules', 'build/spritesmith-generated']
    },

    plugins: [
        // Directly copy the static index and robots files.
        new CopyWebpackPlugin({
            patterns: [
                { from: './static/index.html' },
                { from: './static/robots.txt' },
                { from: './static/images/favicon', to: 'favicon' }
            ]
        }),

        // Extract CSS in a dedicated file.
        new CssExtractPlugin({
            filename: "[name].css"
        }),

        // Build bank icons sprite.
        new SpritesmithPlugin({
            src: {
                cwd: path.resolve(__dirname, 'static', 'images', 'banks'),
                glob: '*.png'
            },
            target: {
                image: path.resolve(__dirname, 'build', 'spritesmith-generated', 'sprite.png'),
                css: path.resolve(__dirname, 'build', 'spritesmith-generated', 'sprite.css')
            },
            apiOptions: {
                cssImageRef: '~sprite.png'
            }
        }),

        // Only keep the useful locales from Moment.
        new webpack.ContextReplacementPlugin(/moment[\/\\]locale$/, localesRegex)
    ]
};

if (process.env.NODE_ENV === "production") {
    const OptimizeCssAssetsPlugin = require('optimize-css-assets-webpack-plugin');

    // Report first error as hard error.
    config.bail = true;

    // Do not capture timing information for each module.
    config.profile = false;

    config.plugins.push(
        // Minimize CSS.
        new OptimizeCssAssetsPlugin({
            cssProcessor: require('cssnano'),
            cssProcessorOptions: {
                zindex: false
            }
        })
    );
} else {
    // By default the development mode has the 'eval' value.
    // See https://webpack.js.org/configuration/devtool/#devtool for other modes.
    config.devtool = 'eval-cheap-module-source-map';
}

if (process.env.ANALYZE) {
    const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
    config.plugins.push(
        // Generate analyzer reports if needed
        new BundleAnalyzerPlugin({
            // Can be `server`, `static` or `disabled`.
            // In `server` mode analyzer will start HTTP server to show bundle report.
            // In `static` mode single HTML file with bundle report will be generated.
            // In `disabled` mode you can use this plugin to just generate Webpack Stats JSON file by setting `generateStatsFile` to `true`.
            analyzerMode: 'static',

            // Path to bundle report file that will be generated in `static` mode.
            // Relative to bundles output directory.
            reportFilename: '../reports/client.html',

            // Module sizes to show in report by default.
            // Should be one of `stat`, `parsed` or `gzip`.
            // See "Definitions" section for more information.
            defaultSizes: 'parsed',

            // Automatically open report in default browser
            openAnalyzer: true,

            // If `true`, Webpack Stats JSON file will be generated in bundles output directory
            generateStatsFile: true,

            // Name of Webpack Stats JSON file that will be generated if `generateStatsFile` is `true`.
            // Relative to bundles output directory.
            statsFilename: '../reports/client.json'
        })
    );
}

module.exports = config;
