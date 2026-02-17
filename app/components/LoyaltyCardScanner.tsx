import React, { useState } from 'react'
import {
    Modal,
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
} from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { Ionicons } from '@expo/vector-icons'

export type LoyaltyCard = {
    id: string
    name: string
    data: string
    type: string
}

type LoyaltyCardScannerProps = {
    visible: boolean
    onClose: () => void
    onCardScanned: (card: LoyaltyCard) => void
}

export function LoyaltyCardScanner({ visible, onClose, onCardScanned }: LoyaltyCardScannerProps) {
    const [permission, requestPermission] = useCameraPermissions()
    const [scannedData, setScannedData] = useState<{ data: string; type: string } | null>(null)
    const [storeName, setStoreName] = useState('')

    const handleBarcodeScanned = ({ data, type }: { data: string; type: string }) => {
        if (scannedData) return
        setScannedData({ data, type })
    }

    const handleSave = () => {
        if (!scannedData || !storeName.trim()) return
        onCardScanned({
            id: Date.now().toString(),
            name: storeName.trim(),
            data: scannedData.data,
            type: scannedData.type,
        })
        resetAndClose()
    }

    const resetAndClose = () => {
        setScannedData(null)
        setStoreName('')
        onClose()
    }

    if (!visible) return null

    if (!permission?.granted) {
        return (
            <Modal visible={visible} animationType="slide" onRequestClose={resetAndClose}>
                <View style={scannerStyles.permissionContainer}>
                    <Ionicons name="camera-outline" size={64} color="#999" />
                    <Text style={scannerStyles.permissionTitle}>Camera Permission Needed</Text>
                    <Text style={scannerStyles.permissionText}>
                        We need camera access to scan loyalty card barcodes.
                    </Text>
                    <TouchableOpacity style={scannerStyles.permissionButton} onPress={requestPermission}>
                        <Text style={scannerStyles.permissionButtonText}>Grant Permission</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={scannerStyles.cancelButton} onPress={resetAndClose}>
                        <Text style={scannerStyles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
        )
    }

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={resetAndClose}>
            <View style={scannerStyles.container}>
                <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    barcodeScannerSettings={{
                        barcodeTypes: [
                            'qr',
                            'ean13',
                            'ean8',
                            'upc_a',
                            'upc_e',
                            'code128',
                            'code39',
                            'code93',
                            'codabar',
                            'itf14',
                            'pdf417',
                            'aztec',
                            'datamatrix',
                        ],
                    }}
                    onBarcodeScanned={scannedData ? undefined : handleBarcodeScanned}
                />

                <TouchableOpacity style={scannerStyles.closeButton} onPress={resetAndClose}>
                    <Ionicons name="close" size={28} color="#fff" />
                </TouchableOpacity>

                {!scannedData && (
                    <View style={scannerStyles.hintContainer}>
                        <Text style={scannerStyles.hintText}>Point camera at a barcode or QR code</Text>
                    </View>
                )}

                {scannedData && (
                    <KeyboardAvoidingView
                        style={scannerStyles.nameOverlay}
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    >
                        <View style={scannerStyles.nameCard}>
                            <Text style={scannerStyles.nameTitle}>Card Scanned!</Text>
                            <Text style={scannerStyles.nameSubtitle}>Enter a name for this card</Text>
                            <TextInput
                                style={scannerStyles.nameInput}
                                placeholder="e.g. Migros, Coop..."
                                placeholderTextColor="#999"
                                value={storeName}
                                onChangeText={setStoreName}
                                autoFocus
                                returnKeyType="done"
                                onSubmitEditing={handleSave}
                            />
                            <View style={scannerStyles.nameButtons}>
                                <TouchableOpacity
                                    style={scannerStyles.nameCancel}
                                    onPress={() => setScannedData(null)}
                                >
                                    <Text style={scannerStyles.nameCancelText}>Rescan</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[scannerStyles.nameSave, !storeName.trim() && { opacity: 0.4 }]}
                                    onPress={handleSave}
                                    disabled={!storeName.trim()}
                                >
                                    <Text style={scannerStyles.nameSaveText}>Save</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                )}
            </View>
        </Modal>
    )
}

const scannerStyles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    closeButton: {
        position: 'absolute',
        top: 60,
        right: 20,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    hintContainer: {
        position: 'absolute',
        bottom: 120,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    hintText: {
        color: '#fff',
        fontSize: 16,
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 20,
        overflow: 'hidden',
    },
    nameOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    nameCard: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 24,
        paddingBottom: 40,
    },
    nameTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },
    nameSubtitle: {
        fontSize: 14,
        color: '#666',
        marginBottom: 16,
    },
    nameInput: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 10,
        padding: 14,
        fontSize: 16,
        color: '#333',
        marginBottom: 16,
    },
    nameButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    nameCancel: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 10,
        backgroundColor: '#f0f0f0',
        alignItems: 'center',
    },
    nameCancelText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
    },
    nameSave: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 10,
        backgroundColor: '#333',
        alignItems: 'center',
    },
    nameSaveText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    permissionContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
        padding: 40,
    },
    permissionTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#333',
        marginTop: 20,
        marginBottom: 8,
    },
    permissionText: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        marginBottom: 24,
    },
    permissionButton: {
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 10,
        backgroundColor: '#333',
        marginBottom: 12,
    },
    permissionButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    cancelButton: {
        paddingVertical: 14,
        paddingHorizontal: 32,
    },
    cancelButtonText: {
        fontSize: 16,
        color: '#666',
    },
})
