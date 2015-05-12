'use strict';

var auditPlugin = require('lib/audit.plugin');
var audit = require('lib/audit.model');
var mongoose = require('mongoose');
var moment = require('moment');

describe('Audit Pluggin Tests', function () {

    var TS = moment().valueOf();

    var secondConnection = mongoose.createConnection('mongodb://localhost/audit-test');

    var AuditTestDefinition = {
        ts: Number,
        value: String
    };
    var AuditTestSchema = new mongoose.Schema(AuditTestDefinition);
    AuditTestSchema.plugin(auditPlugin);
    var AuditTest = mongoose.model('AuditTest', AuditTestSchema);

    before(function (done) {
        var mongoose = require('mongoose');
        mongoose.connect('mongodb://localhost/test');
        mongoose.connection.on('connected', function () {
            done();
        });

    });


    it('Audit Create', function (done) {
        var auditTest = new AuditTest({ts: TS});
        auditTest.save(function(err, doc) {
            if(err) { return done(err); }
            doc.should.have.property('_createdAt');
            doc._createdAt.should.eql(doc._updatedAt);
            AuditTest.getAudit().findOne({'location': 'audittests', 'document.ts': TS}, function(err, audit) {
                audit.operation.should.eql('create');
                done(err);
            });
        });
    });

    it('Audit Update with no changes', function(done) {
        AuditTest.findOne({ts: TS}, function (err, doc) {
            if(err) { return done(err); }
            doc.save(function(err, doc) {
                if(err) { return done(err); }
                doc._createdAt.should.eql(doc._updatedAt);
                // This operation should not include an entry in the history log
                AuditTest.getAudit().count({'location': 'audittests', 'document.ts': TS}, function(err, c) {
                    c.should.eql(1);
                    done(err);
                });
            });
        });
    });

    it('Audit Update', function(done) {
        AuditTest.findOne({ts: TS}, function (err, doc) {
            if(err) { return done(err); }
            setTimeout( function () {
                doc.value = 'foo';
                doc._user = 'cesar';
                doc.save(function(err, doc) {
                    doc._updatedAt.should.be.above(doc._createdAt);
                    doc.should.have.property('_user');
                    AuditTest.getAudit().findOne({'location': 'audittests', 'document.ts': TS, 'operation': 'update'}, function(err, audit) {
                        audit.user.should.eql('cesar');
                        done(err);
                    });
                });
            }, 50);
        });
    });


    it('Audit Delete', function(done) {
        // IMPORTANT!!!!! We cannot use the AuditTest.remove() operation as it does not work with documents
        AuditTest.findOne({ts: TS}, function (err, doc) {
            if(err) { return done(err); }
            doc.remove(function(err) {
                if(err) { return done(err); }
                AuditTest.getAudit().findOne({'location': 'audittests', 'document.ts': TS, 'operation': 'delete'}, function(err) {
                    done(err);
                });
            });
        });
    });

    it('Audit Use a different connection', function (done) {
        if (secondConnection.readyState === 1)  {
            var SecondAuditTestSchema = new mongoose.Schema(AuditTestDefinition);
            SecondAuditTestSchema.plugin(auditPlugin);
            // TODO - If we change SecondAuditTestSchema by AuditTestSchema in the next line with actual implementation
            //        we are retrieving the first connection instead the second, so the autitlog will be created in
            //        test database instead of audit-test one.
            var SecondAuditTest = secondConnection.model('SecondAuditTest', SecondAuditTestSchema);
            var auditTest = new SecondAuditTest({ts: TS});
            auditTest.save(function(err, doc) {
                if(err) { return done(err); }
                doc.should.have.property('_createdAt');
                doc._createdAt.should.eql(doc._updatedAt);
                SecondAuditTest.getAudit().findOne({'location': 'secondaudittests', 'document.ts': TS}, function(err, audit) {
                    audit.operation.should.eql('create');
                    done(err);
                });
            });
        } else {
            // TODO - improve this. The following did not work:
            // secondConnection.on('connected', function() {})
            done(new Error('Second connection is not ready'));
        }
    });

    it('Audit an Model operation', function (done) {
        var ts = moment().valueOf();
        var auditTest = new AuditTest({ts: ts});
        auditTest.save(function(err, doc) {
            AuditTest.findByIdAndRemove(doc._id, function (err, doc) {
                AuditTest.logChange(doc, 'delete', ts, function(err) {
                    if (err){
                        return done(err);
                    }

                    AuditTest.getAudit().findOne({'location': 'audittests', 'document.ts': ts, 'operation': 'delete'}, function(err) {
                        done(err);
                    });
                });
            });
        });
    });

    it('Audit a partial operation', function (done) {
        var ts = moment().valueOf();
        var auditTest = new AuditTest({ts: ts});
        auditTest.save(function(err, doc) {
            AuditTest.remove({ts: TS}, function (err, num) {
                AuditTest.logPartialChange(new AuditTest({_id: doc._id}), 'delete', ts, function(err) {
                    if (err){
                        return done(err);
                    }

                    AuditTest.getAudit().findOne({'location': 'audittests', 'document._id': doc._id, 'operation': 'delete'}, function(err, audit) {
                        audit.partial.should.eql(true);
                        done(err);
                    });
                });
            });
        });
    });
});