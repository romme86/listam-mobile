import React from 'react'
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { LoyaltyCard } from './LoyaltyCardScanner'

type LoyaltyCardViewerProps = {
    visible: boolean
    card: LoyaltyCard | null
    onClose: () => void
    onDelete: (id: string) => void
}

export function LoyaltyCardViewer({ visible, card, onClose, onDelete }: LoyaltyCardViewerProps) {
    if (!card) return null

    const handleDelete = () => {
        Alert.alert(
            'Delete Card',
            `Remove "${card.name}" loyalty card?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
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
            <View style={viewerStyles.container}>
                <View style={viewerStyles.header}>
                    <TouchableOpacity style={viewerStyles.closeButton} onPress={onClose}>
                        <Ionicons name="close" size={28} color="#333" />
                    </TouchableOpacity>
                    <TouchableOpacity style={viewerStyles.deleteButton} onPress={handleDelete}>
                        <Ionicons name="trash-outline" size={22} color="#d00" />
                    </TouchableOpacity>
                </View>

                <View style={viewerStyles.content}>
                    <Text style={viewerStyles.storeName}>{card.name}</Text>
                    <Text style={viewerStyles.barcodeData}>{card.data}</Text>
                    <Text style={viewerStyles.barcodeType}>{card.type}</Text>
                </View>
            </View>
        </Modal>
    )
}

const viewerStyles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 60,
        paddingHorizontal: 20,
    },
    closeButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f0f0f0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    deleteButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#fee',
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
        color: '#333',
        marginBottom: 32,
    },
    barcodeData: {
        fontSize: 24,
        fontWeight: '500',
        color: '#333',
        textAlign: 'center',
        letterSpacing: 2,
        marginBottom: 16,
    },
    barcodeType: {
        fontSize: 13,
        color: '#999',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
})
