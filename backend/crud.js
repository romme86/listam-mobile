
// Add item operation
async function addItem(text, listId) {
    console.error("command RPC_ADD addItem text", text )
    const item = {
        id: generateId(),
        text,
        isDone: false,
        listId: listId,
        timeOfCompletion: 0,
        updatedAt: Date.now(),
        timestamp: Date.now(),
        author: local.key.toString('hex').slice(0, 8)
    }

    const op = {
        type: 'add',
        value: item
    }

    await local.append(Buffer.from(JSON.stringify(op)))
    await autobase.append(Buffer.from(JSON.stringify(op)))
    console.error('Added item:', text)
}

// Update item operation
async function updateItem(id, listId, updates) {
    console.error("command RPC_ADD updateItem  id ,  listId, updates", id ,  listId, updates)
    const existing = listView.get(id)
    if (!existing) {
        console.error('Item not found for update:', id)
        return
    }

    const item = {
        ...existing,
        ...updates,
        timestamp: Date.now()
    }

    const op = {
        type: 'update',
        value: item
    }

    await local.append(Buffer.from(JSON.stringify(op)))
    console.error('Updated item:', item.text)
}

// Delete item operation
async function deleteItem(id) {
    console.error("command RPC_DELETE deleteItem  id ,  listId, updates", id ,  listId, updates)
    const existing = listView.get(id)
    if (!existing) {
        console.error('Item not found for delete:', id)
        return
    }

    const op = {
        type: 'delete',
        value: { id, timestamp: Date.now() }
    }

    await local.append(Buffer.from(JSON.stringify(op)))
    console.error('Deleted item:', existing.text)
}
