'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.getManifest = undefined;

let getManifest = exports.getManifest = (() => {
    var _ref = _asyncToGenerator(function* (req, res) {
        const iconsDirectory = 'favicon/';
        const scope = process.kresus.urlPrefix;

        // Eslint does not like camel_case keys in the JSON
        /* eslint-disable */
        res.status(200).contentType('application/manifest+json').json({
            name: 'Kresus',
            short_name: 'Kresus',
            description: 'Your personal finances manager',
            lang: yield _config2.default.getLocale(),
            start_url: scope,
            scope,
            display: 'fullscreen',
            theme_color: '#303641',
            icons: [{
                src: `${iconsDirectory}favicon-16x16.png`,
                sizes: '16x16',
                type: 'image/png',
                density: 0.75
            }, {
                src: `${iconsDirectory}favicon-32x32.png`,
                sizes: '32x32',
                type: 'image/png',
                density: 0.75
            }, {
                src: `${iconsDirectory}favicon-48x48.png`,
                sizes: '48x48',
                type: 'image/png',
                density: 1
            }, {
                src: `${iconsDirectory}favicon-96x96.png`,
                sizes: '96x96',
                type: 'image/png',
                density: 2
            }, {
                src: `${iconsDirectory}favicon-144x144.png`,
                sizes: '144x144',
                type: 'image/png',
                density: 3
            }, {
                src: `${iconsDirectory}favicon-192x192.png`,
                sizes: '192x192',
                type: 'image/png',
                density: 4
            }]
        });
        /* eslint-enable */
    });

    return function getManifest(_x, _x2) {
        return _ref.apply(this, arguments);
    };
})();

var _config = require('../models/config');

var _config2 = _interopRequireDefault(_config);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

exports.default = {
    manifest: {
        get: getManifest
    }
};