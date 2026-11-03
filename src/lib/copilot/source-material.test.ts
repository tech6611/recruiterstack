import { describe, it, expect } from 'vitest'
import { isPrivateAddress, htmlToText, readLinkText, readFileText, SourceMaterialError } from './source-material'

describe('isPrivateAddress', () => {
  it('blocks loopback, private, link-local and metadata addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
  })
  it('allows public addresses', () => {
    for (const ip of ['8.8.8.8', '104.16.0.1', '2606:4700::1111']) expect(isPrivateAddress(ip), ip).toBe(false)
  })
})

describe('readLinkText safety', () => {
  it('refuses private and non-http links before fetching', async () => {
    for (const url of ['http://localhost:3000/x', 'http://169.254.169.254/latest/meta-data', 'http://10.0.0.5/', 'file:///etc/passwd', 'ftp://example.com/a', 'https://user:pw@example.com/']) {
      await expect(readLinkText(url), url).rejects.toBeInstanceOf(SourceMaterialError)
    }
  })
})

describe('htmlToText', () => {
  it('drops scripts/styles and keeps readable structure', () => {
    const t = htmlToText('<head><title>x</title></head><script>evil()</script><h1>Backend Engineer</h1><p>Build APIs &amp; more</p><ul><li>Go</li><li>Postgres</li></ul>')
    expect(t).not.toContain('evil')
    expect(t).toContain('Backend Engineer')
    expect(t).toContain('Build APIs & more')
    expect(t).toContain('• Go')
  })
})

describe('readFileText', () => {
  it('reads plain text files and rejects unsupported types', async () => {
    const out = await readFileText(Buffer.from('Senior Sales Manager\nBangalore'), 'brief.txt', 'text/plain')
    expect(out.text).toContain('Senior Sales Manager')
    await expect(readFileText(Buffer.from('x'), 'a.exe', 'application/octet-stream')).rejects.toBeInstanceOf(SourceMaterialError)
  })
})
