import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

test('navigation decodes Unicode, plus signs and malformed input without recursive blowup', () => {
    const query = require('query-string')
    assert.deepEqual({ ...query.parse('q=caff%C3%A8+latte&emoji=%F0%9F%8D%8E') }, { emoji: '🍎', q: 'caffè latte' })
    assert.equal(require('decode-uri-component')('a+b'), 'a b')
    const run = spawnSync(process.execPath, ['-e', "const d=require('decode-uri-component'); const s='%FF'.repeat(20000); if(d(s)!==s)process.exit(2)"], { timeout: 2000 })
    assert.equal(run.status, 0, run.error?.message ?? run.stderr.toString())
})

test('image parsers reject zero-size ICNS and JXL boxes without hanging', () => {
    const run = spawnSync(process.execPath, ['-e', `
        const assert=require('node:assert/strict');
        const {ICNS}=require('image-size/dist/types/icns');
        const {JXL}=require('image-size/dist/types/jxl');
        const {HEIF}=require('image-size/dist/types/heif');
        const icns=Buffer.alloc(24); icns.write('icns'); icns.writeUInt32BE(24,4); icns.write('ic10',8);
        assert.throws(()=>ICNS.calculate(icns),/Invalid ICNS/);
        const box=Buffer.alloc(24); box.write('jxlp',4);
        assert.throws(()=>JXL.calculate(box));
        box.write('meta',4); assert.throws(()=>HEIF.calculate(box));
    `], { timeout: 2000 })
    assert.equal(run.status, 0, run.error?.message ?? run.stderr.toString())
})

test('normal PNG and ICNS parsing and Xcode UUID generation remain compatible', () => {
    const size = require('image-size')
    assert.ok(size('assets/images/icon.png').width > 0)
    const icns = Buffer.alloc(16)
    icns.write('icns'); icns.writeUInt32BE(16, 4); icns.write('ic10', 8); icns.writeUInt32BE(8, 12)
    assert.equal(size(icns).width, 1024)
    // Native projects are gitignored and absent on clean CI checkouts. Exercise
    // Xcode's parser + UUID dependency against a tracked minimal project.
    const fixture = fileURLToPath(new URL('./fixtures/uuid-project.pbxproj', import.meta.url))
    const project = require('xcode').project(fixture)
    project.parseSync()
    const id = project.generateUuid()
    assert.match(id, /^[A-F0-9]{24}$/)
    assert.ok(!project.allUuids().includes(id))
})
