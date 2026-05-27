import { describe, it, expect } from 'vitest'
import { isBlockedIp, guardOutboundUrl } from '../src/utils/url-guard.js'

describe('isBlockedIp', () => {
  it('blocks IPv4 loopback', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true)
    expect(isBlockedIp('127.255.255.254')).toBe(true)
  })

  it('blocks IPv4 private ranges', () => {
    expect(isBlockedIp('10.0.0.1')).toBe(true)
    expect(isBlockedIp('192.168.1.5')).toBe(true)
    expect(isBlockedIp('172.16.0.1')).toBe(true)
  })

  it('blocks IPv4 link-local', () => {
    expect(isBlockedIp('169.254.0.1')).toBe(true)
  })

  it('blocks IPv4 multicast / reserved', () => {
    expect(isBlockedIp('224.0.0.1')).toBe(true)
    expect(isBlockedIp('255.255.255.255')).toBe(true)
  })

  it('allows IPv4 public addresses', () => {
    expect(isBlockedIp('8.8.8.8')).toBe(false)
    expect(isBlockedIp('1.1.1.1')).toBe(false)
  })

  it('blocks IPv6 loopback / unspecified', () => {
    expect(isBlockedIp('::1')).toBe(true)
    expect(isBlockedIp('::')).toBe(true)
  })

  it('blocks IPv6 link-local + ULA + multicast', () => {
    expect(isBlockedIp('fe80::1')).toBe(true)
    expect(isBlockedIp('fc00::1')).toBe(true)
    expect(isBlockedIp('ff00::1')).toBe(true)
  })

  it('blocks IPv4-mapped IPv6 of a private address', () => {
    expect(isBlockedIp('::ffff:192.168.1.1')).toBe(true)
  })

  it('rejects non-IP strings', () => {
    expect(isBlockedIp('not-an-ip')).toBe(true)
  })
})

describe('guardOutboundUrl', () => {
  it('rejects invalid URLs', async () => {
    const res = await guardOutboundUrl('not a url')
    expect(res.ok).toBe(false)
  })

  it('rejects non-http protocols', async () => {
    const res = await guardOutboundUrl('ftp://example.com/file')
    expect(res.ok).toBe(false)
    expect(res.reason).toContain('http')
  })

  it('rejects localhost hostname', async () => {
    const res = await guardOutboundUrl('http://localhost/path')
    expect(res.ok).toBe(false)
  })

  it('rejects .local hostnames', async () => {
    const res = await guardOutboundUrl('https://my-printer.local/setup')
    expect(res.ok).toBe(false)
  })

  it('rejects IP literal in private range', async () => {
    const res = await guardOutboundUrl('http://192.168.1.1/admin')
    expect(res.ok).toBe(false)
    expect(res.reason).toContain('blocked')
  })

  it('rejects IPv6 loopback literal', async () => {
    const res = await guardOutboundUrl('http://[::1]/admin')
    expect(res.ok).toBe(false)
  })

  it('accepts a public IPv4 literal', async () => {
    const res = await guardOutboundUrl('https://1.1.1.1/')
    expect(res.ok).toBe(true)
  })
})
