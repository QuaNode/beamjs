/*jslint node: true */
'use strict';

module.exports = function (_, hooks) {

    hooks.on('beforeDefine', function (_, options) {

        options.timestamps = true;
    });
};