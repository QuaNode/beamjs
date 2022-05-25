/*jslint node: true */
'use strict';

var crypto = require('crypto');

module.exports = function (_, hooks, sequelize) {

    var createSecret = function (size) {

        var hex = crypto.randomBytes(...[
            size
        ]).toString('hex');
        return hex.substring(0, size);
    };
    hooks.on('beforeDefine', function () {

        var [attributes] = arguments;
        var {
            STRING
        } = sequelize.Sequelize.DataTypes;
        attributes.secret = {

            type: STRING,
            defaultValue: createSecret(32)
        };
    });
    hooks.on('afterDefine', function () {

        var [Model] = arguments;
        var { prototype } = Model;
        prototype.generateNewSecret = function () {

            var [cb] = arguments;
            this.setDataValue(...[
                'secret',
                createSecret(32)
            ]);
            return this.save().then(...[
                function (model) {

                    cb(...[
                        model.getDataValue(...[
                            'secret'
                        ])
                    ]);
                }
            ]).catch(function (error) {

                cb(null, error);
            });
        };
    });
};