import React, {useEffect, useRef, useState} from 'react'
import {StyleSheet, View} from 'react-native'
import {documentDirectory} from 'expo-file-system'
import {Worklet} from 'react-native-bare-kit'
import bundle from './app.bundle.mjs'
import RPC from 'bare-rpc'
import b4a from 'b4a'
import {RPC_MESSAGE, RPC_RESET, RPC_UPDATE, RPC_DELETE, RPC_ADD, RPC_GET_KEY, SYNC_LIST} from '../rpc-commands.mjs'
import InertialElasticList from './components/intertial_scroll'

type ListEntry = {
    text: string,
    isDone: boolean,
    timeOfCompletion: EpochTimeStamp,
}

export default function App() {
    const [dataList, setDataList] = useState<ListEntry[]>([])

    useEffect(() => {
        if (!isWorkletStarted) {
            startWorklet()
        }
    }, [])
    const [pairingInvite, setPairingInvite] = useState('')
    const [isWorkletStarted, setIsWorkletStarted] = useState(false)
    const rpcRef = useRef<any>(null)

    const startWorklet = () => {

        console.log('Starting worklet')
        const worklet = new Worklet()
        console.log('documentDirectory', documentDirectory, pairingInvite)
        const worklet_start = worklet.start('/app.bundle', bundle, [String(documentDirectory)])
        console.log('worklet_start', worklet_start)
        const {IPC} = worklet

        rpcRef.current = new RPC(IPC, (reqFromBackend) => {
            if (reqFromBackend.command === RPC_MESSAGE) {
                console.log('RPC MESSAGE req', reqFromBackend)
                if (reqFromBackend.data) {
                    console.log('data from bare', b4a.toString(reqFromBackend.data))
                    const data = b4a.toString(reqFromBackend.data)
                    const parsedData = JSON.parse(data)
                    const entry: ListEntry = {
                        text: parsedData[1],
                        isDone: parsedData[2],
                        timeOfCompletion: parsedData[3]
                    }
                } else {
                    console.log('data from bare is null, empty or undefined')
                }

                // const req = rpcRef.current.request(RPC_MESSAGE)
                // req.send(JSON.stringify({ id: 1,  }))
            }
            if (reqFromBackend.command === SYNC_LIST) {
                console.log('RPC SYNC_LIST req')
                if (reqFromBackend.data) {
                    console.log('data from bare', b4a.toString(reqFromBackend.data))
                    const data = b4a.toString(reqFromBackend.data)
                    const parsedData: ListEntry = JSON.parse(data)
                    dataList.push(parsedData)
                    setDataList(() => dataList)
                } else {
                    console.log('data from bare is null, empty or undefined')
                }

                // const req = rpcRef.current.request(RPC_MESSAGE)
                // req.send(JSON.stringify({ id: 1,  }))
            }

            if (reqFromBackend.command === RPC_RESET) {
                console.log('RPC RESET')

                setDataList(() => [])
                const req = rpcRef.current.request(RPC_RESET)
                req.send(JSON.stringify({ id: 1,  }))
            }
            if (reqFromBackend.command === RPC_UPDATE) {
                console.log('RPC_UPDATE')
                if (reqFromBackend.data) {
                    console.log('data from bare', b4a.toString(reqFromBackend.data))
                } else {
                    console.log('data from bare is null, empty or undefined')
                }

                // const req = rpcRef.current.request(RPC_UPDATE)
                // req.send(JSON.stringify({ id: 1,  }))
            }
            if (reqFromBackend.command === RPC_DELETE) {
                console.log('RPC_DELETE')

                const req = rpcRef.current.request(RPC_DELETE)
                req.send(JSON.stringify({ id: 1,  }))
            }
            if (reqFromBackend.command === RPC_GET_KEY) {
                console.log('RPC_GET_KEY')

                // const req = rpcRef.current.request(RPC_GET_KEY)
                // req.send(JSON.stringify({ id: 1,  }))
            }
        })
        setIsWorkletStarted(true)
    }


    const handleToggleDone = (index: number) => {
        setDataList((prevList) => {
            const newList = [...prevList]
            const item = newList[index]
            const updatedItem = {
                ...item,
                isDone: !item.isDone,
                timeOfCompletion: !item.isDone ? Date.now() : 0
            }

            // Remove item from current position
            newList.splice(index, 1)

            // Add to top if reactivating (isDone becomes false)
            // Add to bottom if marking as done (isDone becomes true)
            if (updatedItem.isDone) {
                newList.push(updatedItem) // Add to bottom
            } else {
                newList.unshift(updatedItem) // Add to top
            }
            console.log("sending RPC request update")
            const req = rpcRef.current.request(RPC_UPDATE)
            req.send(JSON.stringify({ id: item.isDone,  }))

            return newList
        })
    }

    const handleDelete = (index: number) => {
        setDataList((prevList) => prevList.filter((_, i) => i !== index))
        const req = rpcRef.current.request(RPC_DELETE)
        req.send(JSON.stringify({ id: 1,  }))
    }

    const handleInsert = (index: number, text: string) => {
        setDataList((prevList) => {
            const newList = [...prevList]
            const newEntry: ListEntry = {
                text,
                isDone: false,
                timeOfCompletion: 0
            }
            newList.splice(index, 0, newEntry)
            const req = rpcRef.current.request(RPC_MESSAGE)
            req.send(JSON.stringify({ id: 1,  }))
            return newList
        })
    }

    return (
        <View style={styles.container}>
            <>
                <InertialElasticList
                    data={dataList}
                    onToggleDone={handleToggleDone}
                    onDelete={handleDelete}
                    onInsert={handleInsert}
                />
                {/*<Button title='Start' onPress={startWorklet} color='#393939ff' />*/}
            </>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
        padding: 20
    },
    input: {
        height: 20,
        borderColor: '#ccc',
        borderWidth: 0,
        marginBottom: 10,
        paddingHorizontal: 10,
        color: '#333'
    },
    dataItem: {
        padding: 10,
        backgroundColor: '#f0f0f0',
        marginVertical: 5,
        borderRadius: 5
    },
    itemText: {
        fontSize: 16,
        color: '#333'
    }
})