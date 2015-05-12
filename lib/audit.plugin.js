'use strict';

/**
 * This plugin allows the audit of the model operations
 * It generates a minimal information in the document and a complete image of the change in
 * the audit collection.
 *
 * Fields added to the document:
 *      _createdAt
 *      _updatedAt
 *      _user
 *
 * Audit document fields:
 *     - ts
 *     - operation
 *     - location (collection)
 *     - document
 *     - user  (optional)
 *     - action (optional)
 *     - partial (optional)
 *
 * By default the audit collection is generated in the same database than the audited model.
 *
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
        if (doc._partial) {
            history.partial = doc._partial;
        }
        audit.insert(history, next);
    };

    var updateDocument = function updateDocument(doc, date) {
        if (doc.isNew) {
            doc._updatedAt = doc._createdAt = date;
        } else {
            doc._updatedAt = date;
        }
    };

    var logChange = function(doc, operation, date, next) {
        updateDocument(doc, date);
        saveHistory(doc, operation, date, next);
    };

    /**
     * Returns the audit collection
     */
    schema.statics.getAudit = function() {
        return require('./audit.model').getAudit(this.collection.name, options);
    };

    /**
     * Allows to register a change from the audited model
     *
     * @param  Document   doc       The document to store
     * @param  String     operation The operation [create|update|delete]
     * @param  Date       date      The Date
     * @param  Function   next      callback
     */
    schema.statics.logChange = logChange;

    /**
     * Allows to register a partial change.
     * It will be allways more useful to store incomple information than nothing. If by
     * the design of the applicaton you wish to introduce auditing it is difficult to provide a
     * full audit, you can allways provide a partial one.
     *
     * @param  Document   doc       The document to store
     * @param  String     operation The operation [create|update|delete]
     * @param  Date       date      The Date
     * @param  Function   next      callback
     */
    schema.statics.logPartialChange = function(doc, operation, date, next) {
        doc._partial = true;
        updateDocument(doc, date);
        saveHistory(doc, operation, date, next);
    };


    /**
     * Update/Create hook
     */
    schema.pre('save', function(next) {
        if (this.isModified()) {
            var date = new Date();
            logChange(this, this.isNew ? 'create' : 'update', date, next);
        } else {
            next();
        }
    });

    /**
     * Remove hook
     */
    schema.pre('remove', function(next) {
        saveHistory(this, 'delete', new Date(), next);
    });
};
