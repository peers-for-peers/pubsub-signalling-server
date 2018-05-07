/* eslint-env mocha, browser */

const Client = require('../').Client
const ClientEvents = require('../').ClientEvents

const assert = require('chai').assert

describe('basic', function () {
  this.timeout(3000)

  let clients = []
  const clientFactory = (...args) => {
    let c = new Client(...args)
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
    let client = clientFactory(4)

    client.signIn((err) => {
      assert(!err)
      done()
    })
  })

  it('TOPIC_INFO_SIMPLE', function (done) {
    const TOPIC = 'foo'
    const CLIENT_ID = 1

    let client = clientFactory(CLIENT_ID)

    client.on(ClientEvents.TOPIC_INFO, (topic, peers) => {
      assert.isOk(topic === TOPIC)
      assert.deepEqual(peers, [client.id])

      done()
    })

    client.signIn()
    client.subscribe(TOPIC)
    client.getTopicInfo(TOPIC)
  })

  it('TOPIC_INFO_TWO_CLIENTS', function (done) {
    const TOPIC = 'foo'

    let c1 = clientFactory(1)
    let c2 = clientFactory(2)

    c1.signIn()
    c2.signIn()

    c1.on(ClientEvents.TOPIC_INFO, (topic, peers) => {
      assert.isOk(topic === TOPIC)
      assert.deepEqual(peers, [1, 2])

      done()
    })

    c1.subscribe(TOPIC, () => c2.subscribe(TOPIC, () => {
      c1.getTopicInfo(TOPIC)
    }))
  })
})
