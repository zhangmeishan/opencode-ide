import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"
import { createServer, request } from "node:http"
import { connect } from "node:net"

export function hashPassword(password) {
  if (password.length < 8) throw new Error("登录密码至少需要 8 个字符")
  const salt = randomBytes(16).toString("hex")
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") }
}

export function verifyPassword(credentials, username, password) {
  const actual = scryptSync(password, credentials.salt, 64)
  const expected = Buffer.from(credentials.hash, "hex")
  return username === credentials.username && actual.length === expected.length && timingSafeEqual(actual, expected)
}

const loginHtml = (redirect = "/") => `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>登录 OpenCode IDE</title><style>body{background:#0b1018;color:#dce5f2;font:16px system-ui;display:grid;place-items:center;min-height:95vh}form{width:300px;padding:32px;background:#151e2b;border-radius:12px}input,button{box-sizing:border-box;width:100%;padding:12px;margin:10px 0;border-radius:6px;border:1px solid #35485f;background:#101722;color:inherit}button{background:#285eb0;cursor:pointer}</style><form method="post" action="/login"><h2>OpenCode IDE</h2><input type="hidden" name="redirect" value="${redirect.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"><label>用户名<input name="username" autocomplete="username" required maxlength="128"></label><label>密码<input name="password" type="password" autocomplete="current-password" required maxlength="1024"></label><button>登录</button></form></html>`

export function createAuthGateway(credentials, upstreamPort) {
  const safeRedirect = value => typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !/[\\\r\n]/.test(value) ? value : "/"
  const sessions = new Map()
  const attempts = new Map()
  const ttl = 12 * 60 * 60 * 1000
  const token = req => /(?:^|;\s*)opencode_ide_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || "")?.[1]
  const authenticated = req => {
    const id = token(req)
    const expires = sessions.get(id)
    if (expires && expires > Date.now()) return true
    sessions.delete(id)
    return false
  }
  const headers = req => {
    const result = { ...req.headers, "x-forwarded-for": req.socket.remoteAddress, "x-forwarded-proto": req.headers["x-forwarded-proto"] || "http" }
    delete result.authorization
    result.cookie = (result.cookie || "").split(";").filter(value => !value.trim().startsWith("opencode_ide_session=")).join(";")
    return result
  }
  const server = createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname
    res.setHeader("Cache-Control", "no-store")
    if (pathname === "/healthz" && req.method === "GET") { res.writeHead(200, { "Content-Type": "text/plain" }); res.end("ok"); return }
    if (pathname === "/login" && req.method === "GET") {
      const redirect = new URL(req.url, "http://localhost").searchParams.get("redirect") || "/"
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "X-Frame-Options": "DENY", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'" })
      res.end(loginHtml(safeRedirect(redirect)))
      return
    }
    if (pathname === "/login" && req.method === "POST") {
      const origin = req.headers.origin
      const expectedOrigin = `${req.headers["x-forwarded-proto"] || "http"}://${req.headers["x-forwarded-host"] || req.headers.host}`
      if (!origin || origin !== expectedOrigin) { res.writeHead(403); res.end(); return }
      const ip = req.socket.remoteAddress
      const now = Date.now()
      const recent = (attempts.get(ip) || []).filter(time => time > now - 60000)
      if (recent.length >= 10) { res.writeHead(429); res.end("尝试过多，请稍后重试"); return }
      attempts.set(ip, [...recent, now])
      let body = ""
      for await (const chunk of req) {
        body += chunk
        if (body.length > 8192) { res.writeHead(413); res.end(); return }
      }
      const form = new URLSearchParams(body)
      if (!verifyPassword(credentials, form.get("username") || "", form.get("password") || "")) {
        res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" }); res.end(loginHtml(form.get("redirect") || "/").replace("<h2>", "<p>用户名或密码错误</p><h2>")); return
      }
      for (const [id, expires] of sessions) if (expires <= now) sessions.delete(id)
      const id = randomBytes(32).toString("hex")
      sessions.set(id, now + ttl)
      attempts.delete(ip)
      const secure = req.headers["x-forwarded-proto"] === "https" || req.socket.encrypted
      const redirect = form.get("redirect") || "/"
      res.writeHead(303, { Location: safeRedirect(redirect), "Set-Cookie": `opencode_ide_session=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${ttl / 1000}${secure ? "; Secure" : ""}` })
      res.end(); return
    }
    if (!authenticated(req)) { res.writeHead(303, { Location: `/login?redirect=${encodeURIComponent(req.url)}` }); res.end(); return }
    if (pathname === "/logout" && (req.method === "GET" || req.method === "POST")) {
      sessions.delete(token(req))
      res.writeHead(303, { Location: "/login", "Set-Cookie": "opencode_ide_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" }); res.end(); return
    }
    const proxy = request({ hostname: "127.0.0.1", port: upstreamPort, path: req.url, method: req.method, headers: headers(req) }, upstream => {
      res.writeHead(upstream.statusCode, upstream.headers)
      upstream.pipe(res)
    })
    proxy.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end("IDE 正在启动，请稍后刷新") })
    req.pipe(proxy)
    res.on("close", () => proxy.destroy())
  })
  server.on("upgrade", (req, socket, head) => {
    const origin = req.headers.origin
    const expectedOrigin = `${req.headers["x-forwarded-proto"] || "http"}://${req.headers["x-forwarded-host"] || req.headers.host}`
    if (!origin || origin !== expectedOrigin) { socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); return }
    if (!authenticated(req)) { socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n"); return }
    const upstream = connect(upstreamPort, "127.0.0.1", () => {
      const rawHeaders = Object.entries(headers(req)).flatMap(([key, value]) => value === undefined ? [] : [`${key}: ${value}`]).join("\r\n")
      upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${rawHeaders}\r\n\r\n`)
      if (head.length) upstream.write(head)
      socket.pipe(upstream).pipe(socket)
    })
    upstream.on("error", () => socket.destroy())
    socket.on("error", () => upstream.destroy())
    socket.on("close", () => upstream.destroy())
    upstream.on("close", () => socket.destroy())
  })
  return server
}
