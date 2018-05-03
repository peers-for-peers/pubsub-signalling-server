/* eslint-env mocha, browser */

const Client = require('../src/client.js').Client
const ClientEvents = require('../src/client.js').ClientEvents

const assert = require('assert')

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
      assert.deepEqual(topic, TOPIC)
      assert.deepEqual(peers, [client.id])

      done()
    })

    client.signIn()
    client.subscribe(TOPIC)
    client.getTopicInfo(TOPIC)
  })
})
