/* eslint-env mocha, browser */

const Client = require('../src/client.js').Client
const ClientEvents = require('../src/client.js').ClientEvents

const chai = require('chai')
chai.config.strict = true
const assert = chai.assert

const deepEq = (a, b) => require('deep-equal')(a, b, { strict: true })

describe('basic', function () {
  this.timeout(3000)

  let clients = []
  const clientFactory = () => {
    let c = new Client(Math.floor(Math.random() * Math.floor(1000000)))
    clients.push(c)
    return c
  }

  // TODO : this needs to be done synchronously to prevent race conditions
  afterEach(function () {
    clients.forEach((c) => {
      c.close()
    })

    clients = []
  })

  /*********/
  /* TESTS */
  /*********/

  it('BASIC_TEST_CALLBACK', function (done) {
    let client = clientFactory(1)

    client.signIn((err) => {
      assert(!err)
      done()
    })
  })

  it('TOPIC_INFO_SIMPLE', function (done) {
    const TOPIC = 'foo'

    let client = clientFactory()

    client.on(ClientEvents.TOPIC_INFO, (topic, peers) => {
      assert.isOk(topic === TOPIC)
      assert.deepEqual(peers, new Set([client.id]))

      done()
    })

    client.signIn()
    client.subscribe(TOPIC)
    client.getTopicInfo(TOPIC)
  })

  it('TOPIC_INFO_TWO_CLIENTS', function (done) {
    const TOPIC = 'foo'

    let c1 = clientFactory()
    let c2 = clientFactory()

    c1.signIn()
    c2.signIn()

    c1.on(ClientEvents.TOPIC_INFO, (topic, peers) => {
      assert.isOk(topic === TOPIC)
      assert.deepEqual(peers, new Set([c1.id, c2.id]))

      done()
    })

    c1.subscribe(TOPIC, () => c2.subscribe(TOPIC, () => {
      c1.getTopicInfo(TOPIC)
    }))
  })

  it('RELAY_BIDIRECTIONAL', function (done) {
    let c1 = clientFactory()
    let c2 = clientFactory()

    const ID_TO_PAYLOAD = {
      [c1.id]: ['foo'],
      [c2.id]: ['bar']
    }

    let ids = new Set()
    const finish = (id) => {
      ids.add(id)
      if (deepEq(ids, new Set([c1.id, c2.id]))) done()
    }

    const relayGen = (c) => (fromId, payload) => {
      assert.isOk(fromId === (c.id === c1.id) ? c2.id : c1.id)
      assert.deepEqual(payload, ID_TO_PAYLOAD[fromId])
      finish(c.id)
    }

    c1.on(ClientEvents.RELAY, relayGen(c1))
    c2.on(ClientEvents.RELAY, relayGen(c2))

    c1.signIn(() => {
      c2.signIn(() => {
        c1.relay(c2.id, ID_TO_PAYLOAD[c1.id])
        c2.relay(c1.id, ID_TO_PAYLOAD[c2.id])
      })
    })
  })
})
