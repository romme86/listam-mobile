import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  Alert,
  StyleSheet
} from 'react-native'
import { documentDirectory } from 'expo-file-system'
import Clipboard from '@react-native-clipboard/clipboard'
import { Worklet } from 'react-native-bare-kit'
import bundle from './app.bundle.mjs'
import RPC from 'bare-rpc'
import b4a from 'b4a'
import { RPC_RESET, RPC_MESSAGE } from '../rpc-commands.mjs'
import InertialElasticList from './components/intertial_scroll'

export type ListEntry = {
  text: string
  isDone: boolean
  timeOfCompletion: EpochTimeStamp
}

export default function App() {
  const [dataList, setDataList] = useState<ListEntry[]>([
    { text: 'Tap to mark as done', isDone: false, timeOfCompletion: 0 },
    { text: 'Double tap to add new', isDone: false, timeOfCompletion: 0 },
    { text: 'Slide left to delete', isDone: false, timeOfCompletion: 0 },
    { text: 'Mozzarella', isDone: false, timeOfCompletion: 0 },
    { text: 'Tomato Sauce', isDone: false, timeOfCompletion: 0 },
    { text: 'Flour', isDone: false, timeOfCompletion: 0 },
    { text: 'Yeast', isDone: false, timeOfCompletion: 0 },
    { text: 'Salt', isDone: false, timeOfCompletion: 0 },
    { text: 'Basil', isDone: false, timeOfCompletion: 0 },
  ])
  const [pairingInvite, setPairingInvite] = useState('')
  const [isWorkletStarted, setIsWorkletStarted] = useState(false)

  const startWorklet = () => {
    const worklet = new Worklet()
    worklet.start('/app.bundle', bundle, [String(documentDirectory), pairingInvite])
    const { IPC } = worklet

    new RPC(IPC, (req) => {
      if (req.command === RPC_MESSAGE) {
        const data = b4a.toString(req.data)
        const parsedData = JSON.parse(data)
        const entry: ListEntry = {
          text: parsedData[1],
          isDone: parsedData[2],
          timeOfCompletion: parsedData[3]
        }
      }

      if (req.command === RPC_RESET) {
        setDataList(() => [])
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
    
    return newList
  })
}

  const handleDelete = (index: number) => {
    setDataList((prevList) => prevList.filter((_, i) => i !== index))
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
      return newList
    })
  }

  return (
    <View style={styles.container}>
      {!isWorkletStarted ? (
        <>
          <InertialElasticList
            data={dataList}
            onToggleDone={handleToggleDone}
            onDelete={handleDelete}
            onInsert={handleInsert}
          />
          <Button title='Start' onPress={startWorklet} color='#393939ff' />
        </>
      ) : (
        <>
          <InertialElasticList
            data={dataList}
            onToggleDone={handleToggleDone}
            onDelete={handleDelete}
            onInsert={handleInsert}
          />
          <TextInput
            style={styles.input}
            placeholder='what do you need to buy?'
            value={pairingInvite}
            onChangeText={setPairingInvite}
          />
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f3f3',
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