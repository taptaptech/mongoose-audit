'use strict';

/**
 * @param  Schema schema
 * @param  Object options Possible options:
 *             - connection: connection to use to create the audit collection
 */
module.exports = function historyPlugin(schema, options) {
    options = options || {};

    schema.add({
        '_createdAt': Date,
        '_updatedAt': Date,
        '_user': String
    });

    schema.statics.getAudit = function() {
        return require('./audit.model').getAudit(this.collection.name, options);
    };

    var updateDocument = function updateDocument(doc, date) {
        if (doc.isNew) {
            doc._updatedAt = doc._createdAt = date;
        } else {
            doc._updatedAt = date;
        }
    };

    var saveHistory = function saveHistory(doc, operation, date, next) {
        options.connection = options.connection || doc.constructor.collection.conn;

        var audit = require('./audit.model').getAudit(doc.constructor.collection.name, options);
        var history = {
            ts: date,
            operation: operation,
            location: doc.collection.name,
            document: doc.toObject()
        };
        if (doc._user) {
            history.user = doc._user;
        }
        if (doc._action) {
            history.action = doc._action;
        }
        audit.insert(history, next);
    };


    schema.pre('save', function(next) {
        if (this.isModified()) {
            var date = new Date();
            updateDocument(this, date);
            saveHistory(this, this.isNew ? 'create' : 'update', date, next);
        } else {
            next();
        }
    });

    schema.pre('remove', function(next) {
        saveHistory(this, 'delete', new Date(), next);
    });
};
