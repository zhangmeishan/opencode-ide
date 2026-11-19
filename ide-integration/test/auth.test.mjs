import assert from "node:assert/strict"
import { test } from "node:test"
import { createServer } from "node:http"
import { connect } from "node:net"
import { createAuthGateway, hashPassword, verifyPassword } from "../../scripts/auth.mjs"

test("password hashing and authenticated gateway protect HTTP and websocket requests", async () => {
  const credentials = { username: "tester", ...hashPassword("a sufficiently long password") }
  assert.equal(verifyPassword(credentials, "tester", "wrong"), false)
  assert.equal(verifyPassword(credentials, "tester", "a sufficiently long password"), true)
  const upstream = createServer((_req, res) => res.end("protected workspace"))
  await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve))
  const gateway = createAuthGateway(credentials, upstream.address().port)
  await new Promise(resolve => gateway.listen(0, "127.0.0.1", resolve))
  const base = `http://127.0.0.1:${gateway.address().port}`
  try {
    const deniedUpgrade = await new Promise((resolve, reject) => {
      const socket = connect(gateway.address().port, "127.0.0.1", () => socket.write(`GET / HTTP/1.1\r\nHost: 127.0.0.1:${gateway.address().port}\r\nOrigin: ${base}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`))
      socket.once("data", data => { resolve(data.toString()); socket.destroy() })
      socket.once("error", reject)
    })
    assert.match(deniedUpgrade, /401 Unauthorized/)
    const unauthenticated = await fetch(`${base}/?folder=sample`, { redirect: "manual" })
    assert.equal(unauthenticated.status, 303)
    assert.equal(unauthenticated.headers.get("location"), "/login?redirect=%2F%3Ffolder%3Dsample")
    assert.equal((await fetch(`${base}/login`, { method: "POST", headers: { origin: base }, body: new URLSearchParams({ username: "tester", password: "wrong" }) })).status, 401)
    const login = await fetch(`${base}/login`, { method: "POST", headers: { origin: base }, redirect: "manual", body: new URLSearchParams({ username: "tester", password: "a sufficiently long password" }) })
    assert.equal(login.status, 303)
    const cookie = login.headers.get("set-cookie").split(";")[0]
    assert.equal(await (await fetch(base, { headers: { cookie } })).text(), "protected workspace")
    assert.equal((await fetch(`${base}/logout`, { method: "GET", headers: { cookie }, redirect: "manual" })).status, 303)
    assert.equal((await fetch(base, { headers: { cookie }, redirect: "manual" })).status, 303)
  } finally {
    await Promise.all([new Promise(resolve => gateway.close(resolve)), new Promise(resolve => upstream.close(resolve))])
  }
})
