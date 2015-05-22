'use strict';

var logger = require('log4js').getLogger('mongoose-audit');
var _ = require('lodash');

/**
 * This plugin allows the audit of the model operations
 * It generates a minimal information in the document and a complete image of the change in
 * the audit collection.
 *
 * Fields added to the document:
 *      _createdAt
 *      _updatedAt
 *      _user (optional)
 *      _action (optional)
 *
 * Audit document fields:
 *     - ts
 *     - operation
 *     - location (collection)
 *     - document
 *     - user  (optional)
 *     - action (optional)
 *     - selector (optional)
 *
 * By default the audit collection is generated in the same database than the audited model.
 *
 * In order to generate the user and action in the autit log, the user must provide the _user and _action fields in the
 * document.
 *
 * The field 'partial' is generated with a partial update
 * The loging a bulk operation the 'selector' field will indicate it, and the document will containg the operation details.
 *
 * @param  Schema schema
 * @param  Object options Possible options:
 *             - connection: connection to use to create the audit collection
 */
module.exports = function AuditPlugin(schema, options) {
    options = options || {};

    schema.add({
        '_createdAt': Date,
        '_updatedAt': Date,
        '_user': String
    });

    // TODO: We need this helper function in order to avoid the following bug:
    //
    // Error: key $set must not start with '$'
    // at Error (<anonymous>)
    // at Function.checkKey (/home/cesar/repos/mongoose-audit/node_modules/mongoose/node_modules/mongodb/node_modules/bson/lib/bson/bson.js:1472:13)
    //
    // Mongoose 3.X is using Mongodb 1.X. Need to check if it is fixed in Mongoose 4.X which uses Mongodb 2.X.

    var supressDolars = function(o){
        var result = {};
        for (var key in o) {
            var value = o[key];
            key = key[0] === '$' ? key.slice(1) : key;

            if (typeof value === 'object') {
                value = supressDolars(value);
            }

            result[key] = value;
        }
        return result;
    };

    var createLogEntry = function(operation, collectionName, date, doc) {
        var result =  {
            ts: date,
            operation: operation,
            location: collectionName,
        };

        if(doc._selector) {
            delete doc._collection;

            result.selector = doc._selector;
            delete doc._selector;
            result.document = supressDolars(doc);
        } else {
            result.document = doc.toObject();
        }

        if (doc._user) {
            result.user = doc._user;
        }

        if (doc._action) {
            result.action = doc._action;
        }

        return result;
    };

    var saveHistory = function saveHistory(doc, operation, date, next) {
        var next = next || function() {};
        var collection = doc._collection || doc.constructor && doc.constructor.collection;
        var collectionName = (collection && collection.name) || schema.options.collection;
        options.connection = options.connection || ( collection && collection.conn);

        if(!options.connection) {
            logger.error('No connection available for ' + collectionName);
            next();
        } else if (!collection) {
            logger.error('No collection available for ' + collectionName);
            next();
        } else if (!collectionName) {
            logger.error('No collection name available');
            next();
        } else {
            var audit = require('./audit.model').getAudit(collectionName, options);
            var logEntry = createLogEntry(operation, collectionName, date, doc);

            audit.insert(logEntry, next);
        }
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


    var logOperation = function(operation, selector, doc, next) {
        var date = new Date();
        doc = _.cloneDeep(doc) || {};
        doc._selector = selector;
        doc._collection = this.collection;
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
     * Manual update logging
     */
    schema.statics.logUpdate = function(doc) {
        logChange(doc, 'update', new Date());
    };

    /**
     * Manual creation logging
     */
    schema.statics.logCreate = function(doc) {
        logChange(doc, 'create', new Date());
    };

    /**
     * Manual deletion logging
     */
    schema.statics.logDelete = function(doc) {
        logChange(doc, 'delete', new Date());
    };


    /**
     * Allows to register an bulk update
     *
     * Instead of logging the affected documents just the operation information will be stored.
     *
     * @param  String operation The kind of operation [update / delete]
     * @param  String selector  The operation selector
     * @param  Object update    The operation itself
     * @param  Function next    The callback (optional)
     */
    schema.statics.logBulkUpdate = function(selector, update, next) {
        logOperation.bind(this)('update', selector, update, next);
    };

    /**
     * Allows to register an bulk remove
     *
     * Instead of logging the affected documents just the operation information will be stored.
     *
     * @param  String operation The kind of operation [update / delete]
     * @param  String selector  The operation selector
     * @param  Object doc       The additional information of the operaton: update operation, options, ...
     * @param  Function next    The callback (optional)
     */
    schema.statics.logBulkDelete = function(selector, next) {
        logOperation.bind(this)('delete', selector, {}, next);
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
