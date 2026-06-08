import { useEffect, useRef, useState, useCallback } from 'react'
import { Alert } from 'react-native'
import { haptics } from '../feedback'
import * as FileSystemExpo from 'expo-file-system'
import { toByteArray } from 'base64-js'
import { Worklet } from 'react-native-bare-kit'
import RPC from 'bare-rpc'
import b4a from 'b4a'
import backendBundleB64 from '../app.ios.bundle.mjs'
// import backendBundleB64 from '../assets/backend.android.bundle.mjs'
import {
    prepareBackendSecretPayload,
    persistBackendSecretFromPayload,
} from '../secrets'
import {
    RPC_MESSAGE,
    RPC_RESET,
    RPC_UPDATE,
    RPC_DELETE,
    RPC_ADD,
    RPC_GET_KEY,
    RPC_ADD_FROM_BACKEND,
    RPC_UPDATE_FROM_BACKEND,
    RPC_DELETE_FROM_BACKEND,
    RPC_JOIN_KEY,
    SYNC_LIST,
    RPC_CREATE_INVITE,
    RPC_PERSIST_SECRET,
    RPC_REMOVE_MEMBER,
    RPC_GET_MEMBERS,
    RPC_GET_OWNER_RECOVERY_CODE,
    RPC_RECOVER_OWNER,
} from '../../rpc-commands.mjs'
import type { ListEntry } from '@/app/components/_types'

export type MembershipMember = {
    writerKey: string
    isOwner: boolean
    isSelf: boolean
}

export type MembershipRoster = {
    currentEpoch: number
    ownerWriterKey: string | null
    canAdminister: boolean
    writers: MembershipMember[]
}

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

export type JoinPhase = 'pairing' | 'permission' | 'syncing' | null

type UseWorkletResult = {
    dataList: ListEntry[]
    setDataList: React.Dispatch<React.SetStateAction<ListEntry[]>>
    autobaseInviteKey: string
    peerCount: number
    isWorkletReady: boolean
    isJoining: boolean
    setIsJoining: React.Dispatch<React.SetStateAction<boolean>>
    isJoiningRef: React.MutableRefObject<boolean>
    joinPhase: JoinPhase
    membershipRoster: MembershipRoster | null
    ownerRecoveryCode: string | null
    clearOwnerRecoveryCode: () => void
    sendRPC: (command: number, payload?: string) => void
}

export type NotifyType = 'info' | 'success' | 'error'
export type NotifyFn = (message: string, type?: NotifyType) => void

export function useWorklet(onNotify?: NotifyFn): UseWorkletResult {
    const [dataList, setDataList] = useState<ListEntry[]>([])
    const [isWorkletReady, setIsWorkletReady] = useState(false)
    const [autobaseInviteKey, setAutobaseInviteKey] = useState('')
    const [peerCount, setPeerCount] = useState(0)
    const [isJoining, setIsJoining] = useState(false)
    const [joinPhase, setJoinPhase] = useState<JoinPhase>(null)
    const [membershipRoster, setMembershipRoster] = useState<MembershipRoster | null>(null)
    const [ownerRecoveryCode, setOwnerRecoveryCode] = useState<string | null>(null)
    const clearOwnerRecoveryCode = useCallback(() => setOwnerRecoveryCode(null), [])

    const rpcRef = useRef<any>(null)
    const workletRef = useRef<Worklet | null>(null)
    const isJoiningRef = useRef(false)
    const notifyRef = useRef<NotifyFn | undefined>(onNotify)
    notifyRef.current = onNotify

    const sendRPC = useCallback((command: number, payload?: string) => {
        if (!rpcRef.current) {
            console.warn('RPC not ready, ignoring command', command)
            return
        }
        const req = rpcRef.current.request(command)
        if (payload !== undefined) {
            req.send(payload)
        }
    }, [])

    const startWorklet = useCallback(async () => {
        console.log('Starting worklet (singleton)')
        const baseDir =
            FileSystemExpo.Paths.document.uri ??
            FileSystemExpo.Paths.cache.uri ??
            ''
        const preparedSecrets = await prepareBackendSecretPayload(String(baseDir))
        if (preparedSecrets.mode !== 'secure-store') {
            const msg = preparedSecrets.mode === 'plaintext-recovery'
                ? 'Secure storage is unavailable; using the legacy key files for this session.'
                : 'Secure storage is unavailable; key material can only be cached for this session.'
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
        rpcRef.current = new RPC(IPC, (reqFromBackend) => {
            if (reqFromBackend.command === RPC_PERSIST_SECRET) {
                const replySecretAck = (stored: boolean, mode?: string) => {
                    try {
                        reqFromBackend.reply(JSON.stringify({ stored, mode }))
                    } catch {
                        // Reply channel closed; backend will fall back to its retry/timeout.
                    }
                }
                if (reqFromBackend.data) {
                    const payload = b4a.toString(reqFromBackend.data)
                    void persistBackendSecretFromPayload(payload)
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
                                notifyRef.current('Could not persist backend key material securely.', 'error')
                            }
                            replySecretAck(false)
                        })
                } else {
                    replySecretAck(false)
                }
                return
            }
            if (reqFromBackend.command === RPC_MESSAGE) {
                console.log('RPC MESSAGE req', reqFromBackend)
                if (reqFromBackend.data) {
                    const dataStr = b4a.toString(reqFromBackend.data)
                    console.log('data from bare', dataStr)
                    try {
                        const payload = JSON.parse(dataStr)
                        if (payload.type === 'peer-count') {
                            const count = typeof payload.count === 'number' ? payload.count : 0
                            setPeerCount(count)
                        } else if (payload.type === 'join-phase') {
                            setJoinPhase(payload.phase || null)
                        } else if (payload.type === 'not-writable') {
                            const msg = payload.message || 'You can’t edit yet — waiting for write access from the host.'
                            if (notifyRef.current) notifyRef.current(msg, 'info')
                            else Alert.alert('Please wait', msg)
                        } else if (payload.type === 'join-success') {
                            setJoinPhase(null)
                            if (isJoiningRef.current) {
                                isJoiningRef.current = false
                                setIsJoining(false)
                            }
                            haptics.success()
                            if (notifyRef.current) notifyRef.current('Connected — your lists are now synced', 'success')
                            else Alert.alert('Success!', 'Connected to peer successfully. Your lists are now synced.')
                        } else if (payload.type === 'join-error') {
                            setJoinPhase(null)
                            if (isJoiningRef.current) {
                                isJoiningRef.current = false
                                setIsJoining(false)
                            }
                            haptics.error()
                            const msg = payload.message || 'Could not connect to this invite. Please try again.'
                            if (notifyRef.current) notifyRef.current(msg, 'error')
                            else Alert.alert('Connection failed', msg)
                        } else if (payload.type === 'membership-roster') {
                            setMembershipRoster(payload.roster ?? null)
                        } else if (payload.type === 'owner-recovery-code') {
                            if (payload.code) {
                                setOwnerRecoveryCode(payload.code)
                            } else if (notifyRef.current) {
                                notifyRef.current('Only the owner device can reveal a recovery code.', 'error')
                            }
                        } else if (payload.type === 'owner-recovered') {
                            if (notifyRef.current) notifyRef.current('Ownership restored on this device.', 'success')
                        } else if (payload.type === 'owner-recovery-failed') {
                            const msg = payload.reason === 'no-owner-on-base'
                                ? 'This list has no recorded owner to recover.'
                                : 'That recovery code is not valid for this list.'
                            if (notifyRef.current) notifyRef.current(msg, 'error')
                        } else if (payload.type === 'member-removed') {
                            if (notifyRef.current) {
                                notifyRef.current(payload.snapshot === false
                                    ? 'Member removed — re-keyed, but new devices may need a manual sync.'
                                    : 'Member removed and access re-keyed.', payload.snapshot === false ? 'info' : 'success')
                            }
                        } else if (payload.type === 'member-removal-failed') {
                            if (notifyRef.current) notifyRef.current('Could not remove that member.', 'error')
                        } else if (payload.type === 'member-removal-incomplete') {
                            if (notifyRef.current) {
                                notifyRef.current('Removed member lost content access, but may still be able to edit. Review needed.', 'error')
                            }
                        } else {
                            console.log('RPC_MESSAGE payload (unhandled type):', payload)
                        }
                    } catch (e) {
                        console.warn('Invalid RPC_MESSAGE payload', dataStr)
                    }
                } else {
                    console.log('RPC_MESSAGE without data')
                }
            }
            if (reqFromBackend.command === RPC_RESET) {
                console.log('RPC RESET')
                setDataList(() => [])
                setAutobaseInviteKey('')
            }
            if (reqFromBackend.command === SYNC_LIST) {
                console.log('SYNC_LIST')
                if (reqFromBackend.data) {
                    console.log('data from bare', b4a.toString(reqFromBackend.data))
                    const listToSync = JSON.parse(b4a.toString(reqFromBackend.data))
                    setDataList(listToSync)
                }
            }
            if (reqFromBackend.command === RPC_DELETE_FROM_BACKEND) {
                console.log('RPC_DELETE_FROM_BACKEND')
                if (reqFromBackend.data) {
                    console.log('data from bare', b4a.toString(reqFromBackend.data))
                    const itemToDelete = JSON.parse(b4a.toString(reqFromBackend.data))
                    setDataList((prevList) => prevList.filter((item) => item.text !== itemToDelete.text))
                }
            }
            if (reqFromBackend.command === RPC_UPDATE_FROM_BACKEND) {
                console.log('RPC_UPDATE_FROM_BACKEND')
                if (reqFromBackend.data) {
                    console.log('data from bare', b4a.toString(reqFromBackend.data))
                    const itemToUpdate = JSON.parse(b4a.toString(reqFromBackend.data))
                    setDataList((prevList) => {
                        return prevList.map((item) =>
                            item.text === itemToUpdate.text ? { ...item, isDone: itemToUpdate.isDone, timeOfCompletion: itemToUpdate.timeOfCompletion } : item
                        )
                    })
                }
            }
            if (reqFromBackend.command === RPC_ADD_FROM_BACKEND) {
                console.log('RPC_ADD_FROM_BACKEND')
                if (reqFromBackend.data) {
                    console.log('data from bare', b4a.toString(reqFromBackend.data))
                    const itemToAdd = JSON.parse(b4a.toString(reqFromBackend.data))
                    setDataList((prevList) => [itemToAdd, ...prevList.filter((item) => item.text !== itemToAdd.text)])
                }
            }
            if (reqFromBackend.command === RPC_GET_KEY) {
                console.log('RPC_GET_KEY')
                if (reqFromBackend.data != null) {
                    const data = b4a.toString(reqFromBackend.data)
                    setAutobaseInviteKey(data)
                } else {
                    console.log('data from bare is null, empty or undefined')
                }
            }
        })

        setIsWorkletReady(true)
    }, [])

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
                    if (notifyRef.current) {
                        notifyRef.current('Could not start the Listam backend.', 'error')
                    }
                })
        } else if (workletSingleton || g.worklet) {
            if (workletSingleton)
            {
                workletRef.current = workletSingleton
            } else if (g.worklet)     {
                workletRef.current = g.worklet
            }
            setIsWorkletReady(true)
        }

        return () => {
            workletRef.current = null
            rpcRef.current = null
        }
    }, [startWorklet])

    return {
        dataList,
        setDataList,
        autobaseInviteKey,
        peerCount,
        isWorkletReady,
        isJoining,
        setIsJoining,
        isJoiningRef,
        joinPhase,
        membershipRoster,
        ownerRecoveryCode,
        clearOwnerRecoveryCode,
        sendRPC,
    }
}

export {
    RPC_UPDATE,
    RPC_DELETE,
    RPC_ADD,
    RPC_JOIN_KEY,
    RPC_CREATE_INVITE,
    RPC_REMOVE_MEMBER,
    RPC_GET_MEMBERS,
    RPC_GET_OWNER_RECOVERY_CODE,
    RPC_RECOVER_OWNER,
}
