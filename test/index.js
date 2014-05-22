var Lab = require('lab')
var Catbox = require('catbox')
var JSONClient = require('..')

var expect = Lab.expect
var before = Lab.before, beforeEach = Lab.beforeEach
var after = Lab.after, afterEach = Lab.afterEach
var describe = Lab.experiment
var it = Lab.test

describe('JSONClient', function() {

    it('throws an error if not created with new', function(done) {
        var fn = function () {
            JSONClient()
        }
        expect(fn).to.throw(Error)
        done()
    })

    describe('client', function() {
        var client

        beforeEach(function(done) {
            client = new Catbox.Client(JSONClient)
            client.start(done)
        })

        afterEach(function(done) {
            client.stop()
            client = null
            done()
        })

        it('gets an item after setting it', function(done) {
            var key = { id: 'x', segment: 'test' }
            client.set(key, '123', 500, function(err) {
                expect(err).to.not.exist
                client.get(key, function(err, result) {
                    expect(err).to.equal(null)
                    expect(result).to.exist
                    expect(result.item).to.equal('123')
                    done()
                })
            })
        })

        it('gets an item after setting it and restarting', function (done) {
            var key = { id: 'x', segment: 'test' }
            client.set(key, '123', 100, function (err) {
                expect(err).to.not.exist
                client.stop()
                client.start(function (err) {
                    client.get(key, function (err, result) {
                        expect(err).to.equal(null)
                        expect(result).to.exist
                        expect(result.item).to.equal('123')
                        done()
                    })
                })
            })
        })

        it('does not get an item after setting it and restarting after expire', function (done) {
            var key = { id: 'x', segment: 'test' }
            client.set(key, '123', 100, function (err) {
                expect(err).to.not.exist
                client.stop()
                setTimeout(function() {
                    client.start(function (err) {
                        expect(err).to.not.exist
                        client.get(key, function (err, result) {
                            expect(err).to.not.exist
                            expect(result).to.not.exist
                            done()
                        })
                    })
                }, 200)
            })
        })

        it('does not get an item after setting it and restarting before expire', function (done) {
            var key = { id: 'x', segment: 'test' }
            client.set(key, '123', 100, function (err) {
                expect(err).to.not.exist
                client.stop()
                client.start(function (err) {
                    expect(err).to.not.exist
                    setTimeout(function() {
                        client.get(key, function (err, result) {
                            expect(err).to.not.exist
                            expect(result).to.not.exist
                            done()
                        })
                    }, 200)
                })

            })
        })

        // TODO: implement the remaining tests from catbox-memory

    })
})
