/*jslint node: true */
'use strict';

var crypto = require('crypto');

module.exports = function (name, hooks, sequelize) {

    var createSecret = function (size) {

        var hex = crypto.randomBytes(size).toString('hex');
        return hex.substring(0, size);
    };
    hooks.on('beforeDefine', function (attributes, options) {

        attributes.secret = {

            type: sequelize.Sequelize.DataTypes.STRING,
            defaultValue: createSecret(32)
        };
    });
    hooks.on('afterDefine', function (Model) {

        Model.prototype.generateNewSecret = function (cb) {

            this.setDataValue('secret', createSecret(32));
            return this.save().then(function (model) {

                cb(model.getDataValue('secret'));
            }).catch(function (error) {

                cb(null, error);
            });
        };
    });
};