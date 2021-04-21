/*jslint node: true */
'use strict';

var crypto = require('crypto');

module.exports = function (name, hooks, sequelize) {

    var hash = function (password, options) {

        var salt,
            saltlen,
            iterations,
            hashedPassword;
        if (options && options.salt) {

            salt = options.salt;
            saltlen = options.salt.length;
        } else {

            saltlen = (options && options.saltlen) || 64;
            salt = crypto.randomBytes(saltlen);
        }
        iterations = (options && options.iterations) || 10000;
        hashedPassword = crypto.pbkdf2Sync(password, salt, iterations, saltlen, 'sha256');
        return 'pkdf2$' + iterations + '$' + salt.toString('hex') + '$' +
            hashedPassword.toString('hex');
    };
    var verify = function (password, hashedPassword) {

        var split = hashedPassword.split('$');
        if (split.length !== 4) {

            throw new Error('Invalid password hash provided');
        }
        var salt = new Buffer(split[2], 'hex'),
            saltlen = salt.length,
            iterations = Number(split[1]);
        var options = {

            salt: salt,
            saltlen: saltlen,
            iterations: iterations
        };
        var verifiedPassword = hash(password, options);
        /* perform the comparison in a constant time to avoid timing attacks
            - see http://carlos.bueno.org/2011/10/timing.html
        */
        if (hashedPassword.length === verifiedPassword.length) {

            var diff = 0;
            for (var i = 0; i < hashedPassword.length; ++i) {

                diff |= hashedPassword.charCodeAt(i) ^ verifiedPassword.charCodeAt(i);
            }
            return diff === 0;
        } else {

            return false;
        }
    };
    hooks.on('beforeDefine', function (attributes, options) {

        attributes.hashed_password = {

            type: sequelize.Sequelize.DataTypes.TEXT
        };
        attributes.password = {

            type: sequelize.Sequelize.DataTypes.VIRTUAL,
            set: function (password) {

                this.setDataValue('hashed_password', hash(password));
            }
        };
    });
    hooks.on('afterDefine', function (Model) {

        Model.prototype.verifyPassword = function (password) {

            if (this.getDataValue('hashed_password')) {

                return verify(password, this.getDataValue('hashed_password'));
            } else {

                return false;
            }
        };
    });
};