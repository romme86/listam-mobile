import React, { useEffect, useMemo, useRef } from 'react'
import { View, StyleSheet } from 'react-native'
import { RichText, useEditorBridge, useEditorContent } from '@10play/tentap-editor'
import { markdownToHtml, htmlToMarkdown, inlineMarkdownToHtml } from '@listam/domain/markdown'
import { useTheme, type Theme } from '../../theme'

type Props = {
    // Stored markdown. Read once to seed the editor (the webview owns the live
    // document thereafter); the latest value is committed back as markdown.
    initialMarkdown: string
    // Called once with the final markdown when the editor unmounts — so the edit
    // is persisted whether the user taps "Save", switches block, or just closes
    // the ticket (mirrors the plain-text fields' commit-on-blur).
    onCommit: (markdown: string) => void
    // 'inline' (callout / description) seeds inline-only so a "# x" line stays
    // literal, matching those surfaces' inline-only view renderer; 'block'
    // (the markdown block) parses headings.
    mode?: 'block' | 'inline'
    minHeight?: number
}

function seed (markdown: string, mode: 'block' | 'inline'): string {
    if (mode === 'inline') {
        return String(markdown || '').split('\n').map((l) => `<p>${inlineMarkdownToHtml(l)}</p>`).join('') || '<p></p>'
    }
    return markdownToHtml(markdown)
}

// WYSIWYG editor for markdown-bearing fields (the markdown + callout blocks and
// the ticket description). TipTap runs inside a webview and only ever shows
// compiled output — the user never sees the raw "**"/"#" syntax — while the
// stored value stays markdown: we seed from markdownToHtml and serialize every
// edit back with htmlToMarkdown, the same bridge the desktop editor uses.
// Formatting is applied by typing markdown (TipTap's built-in input rules),
// which keeps the editor flush against the keyboard with no separate toolbar.
export function RichMarkdownEditor ({ initialMarkdown, onCommit, mode = 'block', minHeight = 140 }: Props) {
    const t = useTheme()
    const styles = useMemo(() => makeStyles(t), [t])
    // The freshest markdown seen from the webview; seeded with the incoming
    // value so a never-loaded editor commits the original rather than blank.
    const latest = useRef(initialMarkdown)
    // True once the editor reports real content, so a transient empty document
    // (emitted before the seeded content loads) can never clear a non-empty field.
    const seenContent = useRef(false)
    // The last markdown actually handed to onCommit. Seeded with the incoming
    // value (already the stored value) so re-emitting the unchanged seed on open
    // is never mistaken for an edit, and the same text is never committed twice.
    const committed = useRef(initialMarkdown)
    const onCommitRef = useRef(onCommit)
    onCommitRef.current = onCommit

    const editor = useEditorBridge({
        autofocus: true,
        avoidIosKeyboard: true,
        dynamicHeight: true, // grow to content so it embeds cleanly in a ScrollView
        initialContent: seed(initialMarkdown, mode),
    })

    // Live HTML from the webview -> markdown. PERSIST on every settled change
    // (lodash debounce fires on the trailing edge, ~once per typing pause), not
    // only on unmount: tapping "Save" / switching block / closing the ticket
    // unmounts this editor synchronously, but the webview delivers its content
    // over an async bridge, so committing only on unmount dropped the last
    // keystrokes of a quick edit — a brand-new block could even save empty. The
    // markdown<->HTML bridge round-trips stably, so the unchanged seed never
    // looks like an edit (md === committed guard); unmount is just a final flush.
    const html = useEditorContent(editor, { type: 'html', debounceInterval: 250 })
    useEffect(() => {
        if (typeof html !== 'string') return
        const md = htmlToMarkdown(html)
        if (md !== '') seenContent.current = true
        if (md === '' && !seenContent.current) return
        latest.current = md
        if (md === committed.current) return
        committed.current = md
        onCommitRef.current(md)
    }, [html])

    // Final flush on unmount — captures the last in-flight burst that may not
    // have settled before Save/close (no-op if already committed live above).
    useEffect(() => () => {
        if (latest.current === committed.current) return
        committed.current = latest.current
        onCommitRef.current(latest.current)
    }, [])

    // Match the app surface: transparent background + themed text/links.
    useEffect(() => {
        editor.injectCSS(`
            * { caret-color: ${t.colors.accent}; }
            body { background: transparent; color: ${t.colors.text};
                font-family: -apple-system, Roboto, sans-serif; font-size: 16px; }
            a { color: ${t.colors.accent}; }
            code { font-family: monospace; background: ${t.colors.surfaceAlt}; border-radius: 4px; padding: 0 3px; }
            h1 { font-size: 22px; } h2 { font-size: 19px; } h3 { font-size: 16px; }
        `)
    }, [editor, t])

    return (
        <View style={[styles.wrap, { minHeight }]}>
            <RichText editor={editor} style={styles.rich} />
        </View>
    )
}

function makeStyles (t: Theme) {
    return StyleSheet.create({
        wrap: {
            backgroundColor: t.colors.surfaceAlt,
            borderRadius: t.radius.sm,
            overflow: 'hidden',
        },
        rich: {
            flex: 1,
            backgroundColor: 'transparent',
            minHeight: 100,
        },
    })
}
