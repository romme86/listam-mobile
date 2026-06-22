import { useEffect, useRef, useState, useCallback, type MutableRefObject } from 'react'
import { Alert } from 'react-native'
import { haptics } from '../feedback'
import * as FileSystemExpo from 'expo-file-system'
import { toByteArray } from 'base64-js'
import { Worklet } from 'react-native-bare-kit'
import RPC from 'bare-rpc'
import backendBundleB64 from '../app.ios.bundle.mjs'
// import backendBundleB64 from '../assets/backend.android.bundle.mjs'
import { decodeBackendRequest, dataToString } from '@listam/client'
import {
    prepareBackendSecretPayload,
    persistBackendSecretFromPayload,
} from '../secrets'
import { appLogger } from '../logger'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { listsActions, selectSelectedListItems } from '../store/listsSlice'
import { selectSyncState, syncActions, type JoinPhase, type NetworkStatus } from '../store/syncSlice'
import {
    devicesActions,
    selectMembershipRoster,
    type MembershipRoster,
} from '../store/devicesSlice'
import { boardConfigActions } from '../store/boardConfigSlice'
import { labelsActions } from '../store/labelsSlice'
import { useI18n } from '../i18n'
import {
    RPC_UPDATE,
    RPC_DELETE,
    RPC_ADD,
    RPC_MOVE,
    RPC_JOIN_KEY,
    RPC_CREATE_INVITE,
    RPC_REMOVE_MEMBER,
    RPC_GET_MEMBERS,
    RPC_GET_OWNER_RECOVERY_CODE,
    RPC_RECOVER_OWNER,
    RPC_RECOVER_STORAGE,
    RPC_CONTROL_PAIR,
    RPC_CONTROL_COMMAND,
    RPC_CONTROL_LIST,
    RPC_GET_BOARD_CONFIG,
    RPC_SET_BOARD_CONFIG,
    RPC_EXPORT_DATA,
    RPC_EXPORT_SEED,
    RPC_IMPORT,
} from '@listam/protocol'
import type { ListEntry } from '@/app/components/_types'

export type { MembershipMember, MembershipRoster } from '../store/devicesSlice'
export type { JoinPhase, NetworkStatus } from '../store/syncSlice'

const GLOBAL_KEY = '__LISTAM_WORKLET_SINGLETON__' as const

// Module-level singleton - persists across component remounts
let workletSingleton: Worklet | null = null
let workletStarted = false

type GlobalWorkletState = {
    started: boolean
    worklet: Worklet | null
}

function getGlobalState(): GlobalWorkletState {
    const g = globalThis as any
    if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = { started: false, worklet: null }
    return g[GLOBAL_KEY] as GlobalWorkletState
}

type UseWorkletResult = {
    dataList: ListEntry[]
    autobaseInviteKey: string
    peerCount: number
    isWorkletReady: boolean
    isJoining: boolean
    setIsJoining: (isJoining: boolean) => void
    isJoiningRef: MutableRefObject<boolean>
    joinPhase: JoinPhase
    networkStatus: NetworkStatus
    membershipRoster: MembershipRoster | null
    ownerRecoveryCode: string | null
    clearOwnerRecoveryCode: () => void
    ownerControl: OwnerControlState
    sendRPC: (command: number, payload?: string) => void
    sendRPCWithReply: (command: number, payload?: string) => Promise<string | null>
}

export type NotifyType = 'info' | 'success' | 'error'
export type NotifyFn = (message: string, type?: NotifyType) => void

export type OwnerControlServer = {
    serverPublicKeyHex: string
    name: string
    capabilities: string[]
}
export type OwnerControlState = {
    deviceId: string | null
    servers: OwnerControlServer[]
    lastResult: { command?: string; serverPublicKeyHex?: string; result?: any } | null
}

export function useWorklet(onNotify?: NotifyFn): UseWorkletResult {
    const i18n = useI18n()
    const dispatch = useAppDispatch()
    const dataList = useAppSelector(selectSelectedListItems)
    const membershipRoster = useAppSelector(selectMembershipRoster)
    const {
        autobaseInviteKey,
        peerCount,
        isWorkletReady,
        isJoining,
        joinPhase,
        networkStatus,
    } = useAppSelector(selectSyncState)
    const [ownerRecoveryCode, setOwnerRecoveryCode] = useState<string | null>(null)
    const clearOwnerRecoveryCode = useCallback(() => setOwnerRecoveryCode(null), [])
    const [ownerControl, setOwnerControl] = useState<OwnerControlState>({
        deviceId: null,
        servers: [],
        lastResult: null,
    })

    const rpcRef = useRef<any>(null)
    const workletRef = useRef<Worklet | null>(null)
    const isJoiningRef = useRef(false)
    const notifyRef = useRef<NotifyFn | undefined>(onNotify)
    const i18nRef = useRef(i18n)
    notifyRef.current = onNotify
    i18nRef.current = i18n

    const setIsJoining = useCallback((nextIsJoining: boolean) => {
        dispatch(syncActions.joiningSet(nextIsJoining))
    }, [dispatch])

    useEffect(() => {
        isJoiningRef.current = isJoining
    }, [isJoining])

    const sendRPC = useCallback((command: number, payload?: string) => {
        if (!rpcRef.current) {
            appLogger.warn('RPC not ready, ignoring command', { command })
            return
        }
        const req = rpcRef.current.request(command)
        if (payload !== undefined) {
            req.send(payload)
        }
    }, [])

    // Request/response variant for commands that return a value (the encrypted
    // backup file, or the import outcome). Mirrors how the backend awaits the
    // persist-secret ack: send, then await the reply and decode it to a string.
    const sendRPCWithReply = useCallback(async (command: number, payload?: string): Promise<string | null> => {
        if (!rpcRef.current) {
            appLogger.warn('RPC not ready, ignoring command', { command })
            return null
        }
        const req = rpcRef.current.request(command)
        req.send(payload ?? '')
        try {
            const raw = await req.reply()
            return raw == null ? null : dataToString(raw)
        } catch (e) {
            appLogger.warn('RPC reply failed', { command, message: (e as Error)?.message })
            return null
        }
    }, [])

    const startWorklet = useCallback(async () => {
        appLogger.info('Starting worklet singleton')
        const baseDir =
            FileSystemExpo.Paths.document.uri ??
            FileSystemExpo.Paths.cache.uri ??
            ''
        const preparedSecrets = await prepareBackendSecretPayload(String(baseDir))
        if (preparedSecrets.mode !== 'secure-store') {
            const msg = preparedSecrets.mode === 'plaintext-recovery'
                ? i18nRef.current.t('backend.secureStorage.legacy')
                : i18nRef.current.t('backend.secureStorage.session')
            if (notifyRef.current) notifyRef.current(msg, 'info')
        }

        const worklet = new Worklet()
        workletSingleton = worklet
        workletRef.current = worklet

        const bundleBytes = toByteArray(backendBundleB64)

        worklet.start('/app.bundle', bundleBytes, [
            String(baseDir),
            '',
            '',
            JSON.stringify(preparedSecrets.backendPayload),
        ])

        const { IPC } = worklet
        rpcRef.current = new RPC(IPC as any, (reqFromBackend) => {
            const event = decodeBackendRequest(reqFromBackend)

            switch (event.type) {
                case 'persist-secret': {
                    const replySecretAck = (stored: boolean, mode?: string) => {
                        try {
                            reqFromBackend.reply(JSON.stringify({ stored, mode }))
                        } catch {
                            // Reply channel closed; backend will fall back to its retry/timeout.
                        }
                    }
                    if (!event.payload) {
                        replySecretAck(false)
                        return
                    }
                    void persistBackendSecretFromPayload(event.payload)
                        .then((result) => {
                            if (result.warning) {
                                if (notifyRef.current) notifyRef.current(result.warning, 'info')
                            }
                            // Only a secure-store write is durable enough for the
                            // backend to retire its plaintext copy.
                            replySecretAck(result.mode === 'secure-store', result.mode)
                        })
                        .catch(() => {
                            if (notifyRef.current) {
                                notifyRef.current(i18nRef.current.t('backend.secretPersistFailed'), 'error')
                            }
                            replySecretAck(false)
                        })
                    return
                }
                case 'message': {
                    const payload = event.payload
                    if (payload.type === 'peer-count') {
                        const count = typeof payload.count === 'number' ? payload.count : 0
                        dispatch(syncActions.peerCountSet(count))
                    } else if (payload.type === 'network-status') {
                        dispatch(syncActions.networkStatusSet(payload.status))
                    } else if (payload.type === 'join-phase') {
                        dispatch(syncActions.joinPhaseSet(payload.phase || null))
                    } else if (payload.type === 'not-writable') {
                        const msg = payload.message || i18nRef.current.t('backend.notWritable')
                        if (notifyRef.current) notifyRef.current(msg, 'info')
                        else Alert.alert(i18nRef.current.t('backend.notWritable.title'), msg)
                    } else if (payload.type === 'join-success') {
                        dispatch(syncActions.joinPhaseSet(null))
                        if (isJoiningRef.current) {
                            isJoiningRef.current = false
                            setIsJoining(false)
                        }
                        haptics.success()
                        if (notifyRef.current) notifyRef.current(i18nRef.current.t('backend.joinSuccess'), 'success')
                        else Alert.alert(
                            i18nRef.current.t('backend.joinSuccess.title'),
                            i18nRef.current.t('backend.joinSuccess.alertMessage')
                        )
                    } else if (payload.type === 'join-error') {
                        dispatch(syncActions.joinPhaseSet(null))
                        if (isJoiningRef.current) {
                            isJoiningRef.current = false
                            setIsJoining(false)
                        }
                        haptics.error()
                        const msg = payload.message || i18nRef.current.t('backend.joinError')
                        if (notifyRef.current) notifyRef.current(msg, 'error')
                        else Alert.alert(i18nRef.current.t('backend.joinError.title'), msg)
                    } else if (payload.type === 'membership-roster') {
                        dispatch(devicesActions.rosterReceived(payload.roster ?? null))
                    } else if (payload.type === 'board-config') {
                        dispatch(boardConfigActions.boardConfigReceived({
                            config: payload.config ?? null,
                            canAdminister: !!payload.canAdminister,
                        }))
                    } else if (payload.type === 'config-denied') {
                        if (notifyRef.current) notifyRef.current(i18nRef.current.t('board.configDenied'), 'error')
                    } else if (payload.type === 'owner-recovery-code') {
                        if (payload.code) {
                            setOwnerRecoveryCode(payload.code)
                        } else if (notifyRef.current) {
                            notifyRef.current(i18nRef.current.t('backend.ownerRecovery.onlyOwner'), 'error')
                        }
                    } else if (payload.type === 'owner-recovered') {
                        if (notifyRef.current) notifyRef.current(i18nRef.current.t('backend.ownerRecovery.restored'), 'success')
                    } else if (payload.type === 'owner-recovery-failed') {
                        const msg = payload.reason === 'no-owner-on-base'
                            ? i18nRef.current.t('backend.ownerRecovery.noOwner')
                            : i18nRef.current.t('backend.ownerRecovery.invalid')
                        if (notifyRef.current) notifyRef.current(msg, 'error')
                    } else if (payload.type === 'member-removed') {
                        if (notifyRef.current) {
                            notifyRef.current(payload.snapshot === false
                                ? i18nRef.current.t('backend.memberRemoved.partial')
                                : i18nRef.current.t('backend.memberRemoved.success'), payload.snapshot === false ? 'info' : 'success')
                        }
                    } else if (payload.type === 'member-removal-failed') {
                        if (notifyRef.current) notifyRef.current(i18nRef.current.t('backend.memberRemoval.failed'), 'error')
                    } else if (payload.type === 'member-removal-incomplete') {
                        if (notifyRef.current) {
                            notifyRef.current(i18nRef.current.t('backend.memberRemoval.incomplete'), 'error')
                        }
                    } else if (payload.type === 'recovery-required') {
                        // M4: storage failed to open. Nothing was deleted; the
                        // user chooses retry or an explicitly destructive reset
                        // (which quarantines the old data first).
                        const sendRecovery = (action: 'retry' | 'reset') => {
                            sendRPC(RPC_RECOVER_STORAGE, JSON.stringify({ action }))
                        }
                        Alert.alert(
                            i18nRef.current.t('backend.recovery.title'),
                            i18nRef.current.t('backend.recovery.message'),
                            [
                                { text: i18nRef.current.t('common.cancel'), style: 'cancel' },
                                {
                                    text: i18nRef.current.t('backend.recovery.reset'),
                                    style: 'destructive',
                                    onPress: () => {
                                        Alert.alert(
                                            i18nRef.current.t('backend.recovery.confirmTitle'),
                                            i18nRef.current.t('backend.recovery.confirmMessage'),
                                            [
                                                { text: i18nRef.current.t('common.cancel'), style: 'cancel' },
                                                {
                                                    text: i18nRef.current.t('backend.recovery.confirmReset'),
                                                    style: 'destructive',
                                                    onPress: () => sendRecovery('reset'),
                                                },
                                            ],
                                        )
                                    },
                                },
                                {
                                    text: i18nRef.current.t('backend.recovery.retry'),
                                    onPress: () => sendRecovery('retry'),
                                },
                            ],
                        )
                    } else if (payload.type === 'recovery-complete') {
                        if (notifyRef.current) {
                            notifyRef.current(payload.mode === 'fresh-base'
                                ? i18nRef.current.t('backend.recovery.completeFresh')
                                : i18nRef.current.t('backend.recovery.completeRetry'), 'success')
                        }
                    } else if (payload.type === 'recovery-failed') {
                        if (notifyRef.current) {
                            notifyRef.current(i18nRef.current.t('backend.recovery.failed'), 'error')
                        }
                    } else if (payload.type === 'owner-control-servers') {
                        setOwnerControl((prev) => ({
                            ...prev,
                            deviceId: typeof payload.deviceId === 'string' ? payload.deviceId : prev.deviceId,
                            servers: Array.isArray(payload.servers) ? payload.servers : prev.servers,
                        }))
                    } else if (payload.type === 'owner-control-paired') {
                        if (payload.ok) {
                            setOwnerControl((prev) => ({
                                ...prev,
                                servers: Array.isArray(payload.servers) ? payload.servers : prev.servers,
                            }))
                            if (notifyRef.current) notifyRef.current(i18nRef.current.t('control.paired'), 'success')
                        } else if (notifyRef.current) {
                            notifyRef.current(i18nRef.current.t('control.pairFailed'), 'error')
                        }
                    } else if (payload.type === 'owner-control-result') {
                        setOwnerControl((prev) => ({
                            ...prev,
                            lastResult: {
                                command: payload.command,
                                serverPublicKeyHex: payload.serverPublicKeyHex,
                                result: payload.result,
                            },
                        }))
                        if (payload.result?.ok === false && notifyRef.current) {
                            notifyRef.current(i18nRef.current.t('control.commandFailed'), 'error')
                        }
                    } else {
                        appLogger.info('Unhandled backend message payload', payload)
                    }
                    return
                }
                case 'message-empty':
                    appLogger.info('Backend RPC message without data')
                    return
                case 'reset':
                    dispatch(listsActions.selectedListCleared())
                    dispatch(syncActions.autobaseInviteKeySet(''))
                    dispatch(devicesActions.rosterReceived(null))
                    dispatch(boardConfigActions.boardConfigReset())
                    dispatch(labelsActions.labelsCleared())
                    return
                case 'sync-list':
                    if (Array.isArray(event.items)) {
                        // Peer/surface name labels ride the same item stream; the
                        // labels slice retains them while listsSlice filters them
                        // out of list rows. SYNC_LIST is default-list-only, so labels
                        // (reserved buckets) actually arrive via *-from-backend below
                        // — fold any present here additively, never clearing.
                        dispatch(listsActions.selectedListItemsSynced(event.items as ListEntry[]))
                        dispatch(labelsActions.labelsApplied(event.items as ListEntry[]))
                    }
                    return
                case 'delete-from-backend':
                    dispatch(listsActions.listItemDeleted(event.item as ListEntry))
                    dispatch(labelsActions.labelItemRemoved(event.item as ListEntry))
                    return
                case 'update-from-backend':
                    dispatch(listsActions.listItemUpdated(event.item as ListEntry))
                    dispatch(labelsActions.labelItemApplied(event.item as ListEntry))
                    return
                case 'add-from-backend':
                    dispatch(listsActions.listItemAdded(event.item as ListEntry))
                    dispatch(labelsActions.labelItemApplied(event.item as ListEntry))
                    return
                case 'invite-key':
                    if (event.key != null) {
                        dispatch(syncActions.autobaseInviteKeySet(event.key))
                    }
                    return
                case 'invalid-json':
                    appLogger.warn('Invalid backend RPC payload', event)
                    return
                case 'unknown':
                    appLogger.info('Unknown backend RPC event', event)
                    return
            }
        })

        dispatch(syncActions.workletReadySet(true))
    }, [dispatch, setIsJoining])

    useEffect(() => {
        const g = getGlobalState()

        if (!workletStarted && !g.started) {
            g.started = true
            workletStarted = true
            void startWorklet()
                .then(() => {
                    g.worklet = workletRef.current
                })
                .catch(() => {
                    g.started = false
                    workletStarted = false
                    dispatch(syncActions.workletReadySet(false))
                    if (notifyRef.current) {
                        notifyRef.current(i18nRef.current.t('backend.startFailed'), 'error')
                    }
                })
        } else if (workletSingleton || g.worklet) {
            if (workletSingleton)
            {
                workletRef.current = workletSingleton
            } else if (g.worklet)     {
                workletRef.current = g.worklet
            }
            dispatch(syncActions.workletReadySet(true))
        }

        return () => {
            workletRef.current = null
            rpcRef.current = null
        }
    }, [dispatch, startWorklet])

    return {
        dataList,
        autobaseInviteKey,
        peerCount,
        isWorkletReady,
        isJoining,
        setIsJoining,
        isJoiningRef,
        joinPhase,
        networkStatus,
        membershipRoster,
        ownerRecoveryCode,
        clearOwnerRecoveryCode,
        ownerControl,
        sendRPC,
        sendRPCWithReply,
    }
}

export {
    RPC_UPDATE,
    RPC_DELETE,
    RPC_ADD,
    RPC_MOVE,
    RPC_JOIN_KEY,
    RPC_CREATE_INVITE,
    RPC_REMOVE_MEMBER,
    RPC_GET_MEMBERS,
    RPC_GET_OWNER_RECOVERY_CODE,
    RPC_RECOVER_OWNER,
    RPC_CONTROL_PAIR,
    RPC_CONTROL_COMMAND,
    RPC_CONTROL_LIST,
    RPC_GET_BOARD_CONFIG,
    RPC_SET_BOARD_CONFIG,
    RPC_EXPORT_DATA,
    RPC_EXPORT_SEED,
    RPC_IMPORT,
}
