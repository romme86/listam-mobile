import React, { useMemo, useState } from 'react'
import { View, Text, Modal, TextInput, TouchableOpacity, ScrollView } from 'react-native'
import { buildProvisioningPayload } from '@listam/provisioning'
import { makeDialogStyles } from './_styles'
import { useTheme } from '../theme'
import { useI18n } from '../i18n'
import type { OwnerControlState } from '../hooks/_useWorklet'
import { useLeafProvisioning, type LeafProvState } from '../hooks/useLeafProvisioning'

type LeafPairingDialogProps = {
    visible: boolean
    ownerControl: OwnerControlState
    // Ask a paired hub for its status snapshot (carries leafBridge details).
    onFetchHubInfo: (serverPublicKeyHex: string) => void
    onClose: () => void
}

type LeafBridgeInfo = { controlKey?: string; hubAddr?: string | null; audioAddr?: string | null } | null

// Provision a nearby leaf (ESP32 voice node) over Bluetooth. The leaf must sync
// with an always-on hub (a phone is a poor hub), so we read the hub's control
// key + LAN address from a paired headless device over owner-control, then
// write WiFi creds + that info into the leaf via @listam/provisioning.
export function LeafPairingDialog({ visible, ownerControl, onFetchHubInfo, onClose }: LeafPairingDialogProps) {
    const t = useTheme()
    const i18n = useI18n()
    const dialogStyles = useMemo(() => makeDialogStyles(t), [t])
    const { state, provision, reset } = useLeafProvisioning()
    const [selectedHub, setSelectedHub] = useState<string | null>(null)
    const [ssid, setSsid] = useState('')
    const [psk, setPsk] = useState('')

    // The leafBridge block from the selected hub's status reply, once it arrives.
    const hubInfo: LeafBridgeInfo | undefined = useMemo(() => {
        const last = ownerControl.lastResult
        if (!last || last.serverPublicKeyHex !== selectedHub) return undefined
        const lb = last.result?.status?.leafBridge
        return lb === undefined ? undefined : (lb as LeafBridgeInfo)
    }, [ownerControl.lastResult, selectedHub])

    const hubReady = !!hubInfo?.controlKey && !!hubInfo?.hubAddr
    const canPair = hubReady && ssid.trim().length > 0 && state.phase !== 'scanning' && state.phase !== 'connecting' && state.phase !== 'writing'

    const selectHub = (serverPublicKeyHex: string) => {
        setSelectedHub(serverPublicKeyHex)
        reset()
        onFetchHubInfo(serverPublicKeyHex)
    }

    const onPair = async () => {
        if (!hubInfo?.controlKey || !hubInfo?.hubAddr) return
        const payload = buildProvisioningPayload({
            controlKey: hubInfo.controlKey,
            hubAddr: hubInfo.hubAddr,
            wifi: [{ ssid: ssid.trim(), psk }],
            audioAddr: hubInfo.audioAddr ?? undefined,
        })
        await provision(payload)
    }

    const close = () => {
        reset()
        setSelectedHub(null)
        setSsid('')
        setPsk('')
        onClose()
    }

    return (
        <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={close}>
            <View style={dialogStyles.overlay}>
                <View style={dialogStyles.dialog}>
                    <Text style={dialogStyles.title}>{i18n.t('leaf.section')}</Text>
                    <Text style={dialogStyles.subtitle}>{i18n.t('leaf.subtitle')}</Text>

                    <ScrollView style={{ maxHeight: 320 }}>
                        {ownerControl.servers.length === 0 ? (
                            <Text style={[dialogStyles.subtitle, { marginTop: 12 }]}>{i18n.t('leaf.noHubs')}</Text>
                        ) : (
                            <>
                                <Text style={[dialogStyles.subtitle, { marginTop: 12, color: t.colors.text }]}>
                                    {i18n.t('leaf.selectHub')}
                                </Text>
                                {ownerControl.servers.map((server) => {
                                    const active = server.serverPublicKeyHex === selectedHub
                                    return (
                                        <TouchableOpacity
                                            key={server.serverPublicKeyHex}
                                            style={[
                                                dialogStyles.button,
                                                active ? dialogStyles.submitButton : dialogStyles.cancelButton,
                                                { alignSelf: 'stretch', marginTop: 6 },
                                            ]}
                                            onPress={() => selectHub(server.serverPublicKeyHex)}
                                            accessibilityRole="button"
                                        >
                                            <Text style={active ? dialogStyles.submitButtonText : dialogStyles.cancelButtonText}>
                                                {server.name || server.serverPublicKeyHex.slice(0, 8)}
                                            </Text>
                                        </TouchableOpacity>
                                    )
                                })}

                                {selectedHub && hubInfo === undefined ? (
                                    <Text style={[dialogStyles.subtitle, { marginTop: 10 }]}>{i18n.t('leaf.checkingHub')}</Text>
                                ) : null}
                                {selectedHub && hubInfo === null ? (
                                    <Text style={[dialogStyles.subtitle, { marginTop: 10 }]}>{i18n.t('leaf.hubNoBridge')}</Text>
                                ) : null}

                                {hubReady ? (
                                    <>
                                        <TextInput
                                            style={dialogStyles.input}
                                            value={ssid}
                                            onChangeText={setSsid}
                                            placeholder={i18n.t('leaf.wifiSsid')}
                                            placeholderTextColor={t.colors.placeholder}
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                        />
                                        <TextInput
                                            style={dialogStyles.input}
                                            value={psk}
                                            onChangeText={setPsk}
                                            placeholder={i18n.t('leaf.wifiPsk')}
                                            placeholderTextColor={t.colors.placeholder}
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                            secureTextEntry={true}
                                        />
                                    </>
                                ) : null}

                                <StatusLine state={state} i18n={i18n} style={[dialogStyles.subtitle, { marginTop: 10 }]} />
                            </>
                        )}
                    </ScrollView>

                    <View style={dialogStyles.buttonContainer}>
                        <TouchableOpacity
                            style={[dialogStyles.button, dialogStyles.cancelButton]}
                            onPress={close}
                            accessibilityRole="button"
                        >
                            <Text style={dialogStyles.cancelButtonText}>{i18n.t('common.close')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[dialogStyles.button, dialogStyles.submitButton, !canPair && { opacity: 0.5 }]}
                            onPress={onPair}
                            disabled={!canPair}
                            accessibilityRole="button"
                        >
                            <Text style={dialogStyles.submitButtonText}>{i18n.t('leaf.scanPair')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    )
}

function StatusLine({ state, i18n, style }: { state: LeafProvState; i18n: ReturnType<typeof useI18n>; style: object }) {
    let key: string | null = null
    if (state.phase === 'scanning') key = 'leaf.scanning'
    else if (state.phase === 'connecting') key = 'leaf.connecting'
    else if (state.phase === 'writing') key = 'leaf.writing'
    else if (state.phase === 'success') key = 'leaf.success'
    else if (state.phase === 'error') {
        key =
            state.reason === 'not-found'
                ? 'leaf.notFound'
                : state.reason === 'bt-unavailable' || state.reason === 'permissions'
                  ? 'leaf.btUnavailable'
                  : 'leaf.failed'
    }
    if (!key) return null
    return <Text style={style}>{i18n.t(key as never)}</Text>
}
