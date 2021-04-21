/*jslint node: true */
'use strict';

module.exports = function (name, hooks) {

    hooks.on('beforeDefine', function (attributes, options) {

        options.timestamps = true;
    });
};