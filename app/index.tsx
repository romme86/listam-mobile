import React, {useEffect, useRef, useState} from 'react'
import {StyleSheet, View} from 'react-native'
import {documentDirectory} from 'expo-file-system'
import {Worklet} from 'react-native-bare-kit'
import bundle from './app.bundle.mjs'
import RPC from 'bare-rpc'
import b4a from 'b4a'
import {RPC_MESSAGE, RPC_RESET, RPC_UPDATE, RPC_DELETE, RPC_ADD, RPC_CMDS} from '../rpc-commands.mjs'
import InertialElasticList from './components/intertial_scroll'

type ListEntry = {
    text: string,
    isDone: boolean,
    timeOfCompletion: EpochTimeStamp,
}

export default function App() {
    const [dataList, setDataList] = useState<ListEntry[]>([
        {text: 'Tap to mark as done', isDone: false, timeOfCompletion: 0},
        {text: 'Double tap to add new', isDone: false, timeOfCompletion: 0},
        {text: 'Slide left to delete', isDone: false, timeOfCompletion: 0},
        {text: 'Mozzarella', isDone: false, timeOfCompletion: 0},
        {text: 'Tomato Sauce', isDone: false, timeOfCompletion: 0},
        {text: 'Flour', isDone: false, timeOfCompletion: 0},
        {text: 'Yeast', isDone: false, timeOfCompletion: 0},
        {text: 'Salt', isDone: false, timeOfCompletion: 0},
        {text: 'Basil', isDone: false, timeOfCompletion: 0},
    ])

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
        const worklet_start = worklet.start('/app.bundle', bundle, [String(documentDirectory), pairingInvite])
        console.log('worklet_start', worklet_start)
        const {IPC} = worklet
        console.log('IPC', IPC)

        rpcRef.current = new RPC(IPC, (req) => {
            console.log('IPC', req)
            if (req.command === RPC_MESSAGE) {
                console.log('RPC MESSAGE')

                const data = b4a.toString(req.data)
                const parsedData = JSON.parse(data)
                const entry: ListEntry = {
                    text: parsedData[1],
                    isDone: parsedData[2],
                    timeOfCompletion: parsedData[3]
                }
                const req = rpcRef.current.request(RPC_MESSAGE)
                req.send(JSON.stringify({ id: 1,  }))
            }

            if (req.command === RPC_RESET) {
                console.log('RPC RESET')

                setDataList(() => [])
                const req = rpcRef.current.request(RPC_RESET)
                req.send(JSON.stringify({ id: 1,  }))
            }
            if (req.command === RPC_UPDATE) {
                console.log('RPC_UPDATE')

                const req = rpcRef.current.request(RPC_UPDATE)
                req.send(JSON.stringify({ id: 1,  }))
            }
            if (req.command === RPC_DELETE) {
                console.log('RPC_DELETE')

                const req = rpcRef.current.request(RPC_DELETE)
                req.send(JSON.stringify({ id: 1,  }))
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