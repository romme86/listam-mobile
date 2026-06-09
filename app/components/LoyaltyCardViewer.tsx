import React, { useMemo } from 'react'
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import Svg, { Rect } from 'react-native-svg'
import { useTheme, type Theme } from '../theme'
import { useI18n } from '../i18n'
import type { LoyaltyCard } from './LoyaltyCardScanner'

const QRCode = require('qrcode-terminal/vendor/QRCode')
const QRErrorCorrectLevel = require('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel')
const EAN_LEFT_ODD = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const EAN_LEFT_EVEN = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
const EAN_RIGHT = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100']
const EAN13_PARITY = ['OOOOOO', 'OOEOEE', 'OOEEOE', 'OOEEEO', 'OEOOEE', 'OEEOOE', 'OEEEOO', 'OEOEOE', 'OEOEEO', 'OEEOEO']

function digitsOnly(value: string) {
    return value.replace(/\D/g, '')
}

function computeModulo10CheckDigit(payload: string) {
    let sum = 0
    const digits = payload.split('').map(Number)
    const parityFromRight = payload.length % 2 === 0

    for (let i = 0; i < digits.length; i++) {
        const shouldTriple = parityFromRight ? i % 2 === 0 : i % 2 === 1
        sum += digits[i] * (shouldTriple ? 3 : 1)
    }

    return String((10 - (sum % 10)) % 10)
}

function normalizeEan13(value: string) {
    const digits = digitsOnly(value)
    if (digits.length === 12) return `${digits}${computeModulo10CheckDigit(digits)}`
    if (digits.length === 13) return digits
    return null
}

function normalizeEan8(value: string) {
    const digits = digitsOnly(value)
    if (digits.length === 7) return `${digits}${computeModulo10CheckDigit(digits)}`
    if (digits.length === 8) return digits
    return null
}

function normalizeUpcA(value: string) {
    const digits = digitsOnly(value)
    if (digits.length === 11) return `${digits}${computeModulo10CheckDigit(digits)}`
    if (digits.length === 12) return digits
    return null
}

function expandUpcEToUpcA(value: string) {
    const digits = digitsOnly(value)
    let numberSystem = '0'
    let body = digits
    let checkDigit: string | null = null

    if (digits.length === 8) {
        numberSystem = digits[0]
        body = digits.slice(1, 7)
        checkDigit = digits[7]
    } else if (digits.length === 7) {
        numberSystem = digits[0]
        body = digits.slice(1)
    } else if (digits.length !== 6) {
        return null
    }

    if (!/^[01]$/.test(numberSystem) || !/^\d{6}$/.test(body)) return null

    const [d1, d2, d3, d4, d5, d6] = body
    let manufacturer = ''
    let product = ''

    if (d6 === '0' || d6 === '1' || d6 === '2') {
        manufacturer = `${d1}${d2}${d6}00`
        product = `00${d3}${d4}${d5}`
    } else if (d6 === '3') {
        manufacturer = `${d1}${d2}${d3}00`
        product = `000${d4}${d5}`
    } else if (d6 === '4') {
        manufacturer = `${d1}${d2}${d3}${d4}0`
        product = `0000${d5}`
    } else {
        manufacturer = `${d1}${d2}${d3}${d4}${d5}`
        product = `0000${d6}`
    }

    const payload = `${numberSystem}${manufacturer}${product}`
    return `${payload}${checkDigit ?? computeModulo10CheckDigit(payload)}`
}

function encodeEan13(value: string) {
    const normalized = normalizeEan13(value)
    if (!normalized) return null

    const firstDigit = Number(normalized[0])
    const leftDigits = normalized.slice(1, 7)
    const rightDigits = normalized.slice(7)
    const parity = EAN13_PARITY[firstDigit]

    let bits = '101'
    for (let i = 0; i < leftDigits.length; i++) {
        const digit = Number(leftDigits[i])
        bits += parity[i] === 'O' ? EAN_LEFT_ODD[digit] : EAN_LEFT_EVEN[digit]
    }
    bits += '01010'
    for (const char of rightDigits) bits += EAN_RIGHT[Number(char)]
    bits += '101'

    return { bits, label: normalized }
}

function encodeEan8(value: string) {
    const normalized = normalizeEan8(value)
    if (!normalized) return null

    let bits = '101'
    for (const char of normalized.slice(0, 4)) bits += EAN_LEFT_ODD[Number(char)]
    bits += '01010'
    for (const char of normalized.slice(4)) bits += EAN_RIGHT[Number(char)]
    bits += '101'

    return { bits, label: normalized }
}

function encodeUpcA(value: string) {
    const normalized = normalizeUpcA(value)
    if (!normalized) return null
    const encoded = encodeEan13(`0${normalized}`)
    if (!encoded) return null
    return { bits: encoded.bits, label: normalized }
}

function encodeUpcE(value: string) {
    const expanded = expandUpcEToUpcA(value)
    if (!expanded) return null
    return encodeUpcA(expanded)
}

function createFallbackBars(value: string) {
    const source = value.trim() || '0'
    let bits = '1010'

    for (let i = 0; i < source.length; i++) {
        const code = source.charCodeAt(i)
        const chunk = (code ^ (i * 29 + 17)).toString(2).padStart(8, '0')
        bits += chunk
    }

    return { bits: `${bits}101`, label: source }
}

function getBarcodeEncoding(value: string, type: string) {
    switch (type.toLowerCase()) {
        case 'ean13':
            return encodeEan13(value) ?? createFallbackBars(value)
        case 'ean8':
            return encodeEan8(value) ?? createFallbackBars(value)
        case 'upc_a':
            return encodeUpcA(value) ?? createFallbackBars(value)
        case 'upc_e':
            return encodeUpcE(value) ?? createFallbackBars(value)
        default:
            return createFallbackBars(value)
    }
}

function QRCodeGraphic({ value, size = 240 }: { value: string; size?: number }) {
    const qr = new QRCode(-1, QRErrorCorrectLevel.L)
    qr.addData(value)
    qr.make()

    const moduleCount = qr.getModuleCount()
    const cellSize = size / moduleCount

    return (
        <View style={frameStyles.qrFrame}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <Rect x={0} y={0} width={size} height={size} fill="#fff" />
                {qr.modules.map((row: boolean[], rowIndex: number) =>
                    row.map((isDark, colIndex) => (
                        isDark ? (
                            <Rect
                                key={`${rowIndex}-${colIndex}`}
                                x={colIndex * cellSize}
                                y={rowIndex * cellSize}
                                width={cellSize}
                                height={cellSize}
                                fill="#111"
                            />
                        ) : null
                    ))
                )}
            </Svg>
        </View>
    )
}

function BarcodeGraphic({
    value,
    type,
    width = 280,
    height = 132,
}: {
    value: string
    type: string
    width?: number
    height?: number
}) {
    const encoding = getBarcodeEncoding(value, type)
    const quietZone = 12
    const barHeight = height - 28
    const barWidth = (width - quietZone * 2) / encoding.bits.length

    return (
        <View style={frameStyles.barcodeFrame}>
            <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
                <Rect x={0} y={0} width={width} height={height} fill="#fff" />
                {encoding.bits.split('').map((bit, index) => (
                    bit === '1' ? (
                        <Rect
                            key={`bar-${index}`}
                            x={quietZone + index * barWidth}
                            y={8}
                            width={barWidth}
                            height={barHeight}
                            fill="#111"
                        />
                    ) : null
                ))}
            </Svg>
            <Text style={frameStyles.barcodeCaption}>{encoding.label}</Text>
        </View>
    )
}

type LoyaltyCardViewerProps = {
    visible: boolean
    card: LoyaltyCard | null
    onClose: () => void
    onDelete: (id: string) => void
}

export function LoyaltyCardViewer({ visible, card, onClose, onDelete }: LoyaltyCardViewerProps) {
    const t = useTheme()
    const i18n = useI18n()
    const insets = useSafeAreaInsets()
    const styles = useMemo(() => makeStyles(t), [t])

    if (!card) return null
    const normalizedType = card.type.toLowerCase()
    const isQrCard = normalizedType.includes('qr')

    const handleDelete = () => {
        Alert.alert(
            i18n.t('loyalty.viewer.delete.title'),
            i18n.t('loyalty.viewer.delete.message', { name: card.name }),
            [
                { text: i18n.t('common.cancel'), style: 'cancel' },
                {
                    text: i18n.t('common.delete'),
                    style: 'destructive',
                    onPress: () => {
                        onDelete(card.id)
                        onClose()
                    },
                },
            ]
        )
    }

    return (
        <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
            <View style={styles.container}>
                <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
                    <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityRole="button">
                        <Ionicons name="close" size={28} color={t.colors.text} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} accessibilityRole="button">
                        <Ionicons name="trash-outline" size={22} color={t.colors.danger} />
                    </TouchableOpacity>
                </View>

                <View style={styles.content}>
                    <Text style={styles.storeName}>{card.name}</Text>
                    {isQrCard && <QRCodeGraphic value={card.data} />}
                    {!isQrCard && <BarcodeGraphic value={card.data} type={card.type} />}
                    <Text style={styles.barcodeData}>{card.data}</Text>
                    <Text style={styles.barcodeType}>{card.type}</Text>
                </View>
            </View>
        </Modal>
    )
}

// The code graphics stay on a white card with dark modules so scanners can
// always read them, regardless of the app theme.
const frameStyles = StyleSheet.create({
    qrFrame: {
        padding: 14,
        borderRadius: 20,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#e8e8e8',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 18,
        elevation: 3,
        marginBottom: 24,
    },
    barcodeFrame: {
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 14,
        borderRadius: 20,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#e8e8e8',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 18,
        elevation: 3,
        marginBottom: 24,
        alignItems: 'center',
    },
    barcodeCaption: {
        marginTop: 4,
        fontSize: 14,
        color: '#333',
        letterSpacing: 1.4,
    },
})

function makeStyles(t: Theme) {
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: t.colors.bg,
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: t.spacing.lg,
        },
        closeButton: {
            width: 44,
            height: 44,
            borderRadius: t.radius.pill,
            backgroundColor: t.colors.surfaceAlt,
            justifyContent: 'center',
            alignItems: 'center',
        },
        deleteButton: {
            width: 44,
            height: 44,
            borderRadius: t.radius.pill,
            backgroundColor: t.colors.dangerSurface,
            justifyContent: 'center',
            alignItems: 'center',
        },
        content: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 40,
        },
        storeName: {
            fontSize: 32,
            fontWeight: '700',
            color: t.colors.text,
            marginBottom: 32,
        },
        barcodeData: {
            fontSize: 20,
            fontWeight: '500',
            color: t.colors.text,
            textAlign: 'center',
            letterSpacing: 0.6,
            marginBottom: 16,
        },
        barcodeType: {
            fontSize: 13,
            color: t.colors.textTertiary,
            textTransform: 'uppercase',
            letterSpacing: 1,
        },
    })
}
