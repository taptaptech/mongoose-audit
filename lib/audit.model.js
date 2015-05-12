'use strict';

var mongoose = require('mongoose');

// We need to keep track of the connection each collection uses
// as we will have an audit collection per connection

var audits = {};

module.exports = {

    /**
     * Retrieves the audit model for a collection
     *
     * @param  String collectionName
     * @param  Object options (optional). We can provide optionally an alternative connection to store the
     *         audit collection in 'connection' key.
     * @return Model
     */
    getAudit: function(collectionName, options) {
        if (!audits[collectionName]) {
            var connection = options && options.connection ? options.connection : mongoose;
            var db = connection.db;
            audits[collectionName] = db.collection('auditlog');
        }

        return audits[collectionName];
    }
};
