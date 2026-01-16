import React, { useRef, useState, useCallback, useMemo } from "react";
import {
  Animated,
  Dimensions,
  StyleSheet,
  FlatListProps,
  TouchableOpacity,
  TextInput,
  PanResponder,
  View,
} from "react-native";
import type { ListEntry } from "../index";

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");
const ITEM_HEIGHT = 60;
const SPACING = 16;
const TOTAL_ITEM_HEIGHT = ITEM_HEIGHT + SPACING;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.2;

// Generate a stable unique key for each item
const getItemKey = (item: ListEntry, index: number): string => {
  return `${item.text}-${item.timeOfCompletion}-${index}`;
};

type Props = {
  data: ListEntry[];
  onToggleDone?: (index: number) => void;
  onDelete?: (index: number) => void;
  onUpdate?: (index: number, text: string) => void;
  onInsert?: (index: number, text: string) => void;
};

// Separate component for each list item to manage its own pan state
type ListItemProps = {
  item: ListEntry;
  index: number;
  scrollY: Animated.Value;
  onToggleDone?: (index: number) => void;
  onDelete?: (index: number) => void;
  onInsert?: (index: number, text: string) => void;
  isEditing: boolean;
  editText: string;
  setEditText: (text: string) => void;
  onStartEdit: (index: number) => void;
  onSubmitEdit: () => void;
  onCancelEdit: () => void;
};

function ListItem({
  item,
  index,
  scrollY,
  onToggleDone,
  onDelete,
  onInsert,
  isEditing,
  editText,
  setEditText,
  onStartEdit,
  onSubmitEdit,
  onCancelEdit,
}: ListItemProps) {
  const panX = useRef(new Animated.Value(0)).current;
  const lastTapRef = useRef<number>(0);
  const isDeleting = useRef(false);

  // Reset panX when item changes (FlatList recycles views)
  React.useEffect(() => {
    panX.setValue(0);
    isDeleting.current = false;
  }, [item.text, item.timeOfCompletion]);

  const handleSingleTap = useCallback(() => {
    if (onToggleDone) {
      onToggleDone(index);
    }
  }, [onToggleDone, index]);

  const handleDoubleTap = useCallback(() => {
    if (onInsert) {
      onStartEdit(index);
    }
  }, [onInsert, onStartEdit, index]);

  const handlePress = useCallback(() => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (lastTapRef.current && now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      handleDoubleTap();
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
      setTimeout(() => {
        if (lastTapRef.current === now) {
          handleSingleTap();
        }
      }, DOUBLE_TAP_DELAY);
    }
  }, [handleDoubleTap, handleSingleTap]);

  const handleLongPress = useCallback(() => {
    if (onToggleDone) {
      onToggleDone(index);
    }
  }, [onToggleDone, index]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: (_, gestureState) => {
      // Capture horizontal swipes before TouchableOpacity processes them
      return Math.abs(gestureState.dx) > 5 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
    },
    onPanResponderGrant: () => {
      // Reset deleting state when starting a new gesture
      isDeleting.current = false;
    },
    onPanResponderMove: (_, gestureState) => {
      // Only allow right swipe (positive dx)
      if (gestureState.dx > 0 && !isDeleting.current) {
        panX.setValue(gestureState.dx);
      }
    },
    onPanResponderRelease: (_, gestureState) => {
      if (isDeleting.current) return;

      if (gestureState.dx > SWIPE_THRESHOLD) {
        // Mark as deleting to prevent further interactions
        isDeleting.current = true;

        // Animate off screen then delete
        Animated.timing(panX, {
          toValue: SCREEN_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          if (onDelete) {
            onDelete(index);
          }
        });
      } else {
        // Spring back to original position
        Animated.spring(panX, {
          toValue: 0,
          useNativeDriver: true,
          friction: 8,
          tension: 100,
        }).start();
      }
    },
    onPanResponderTerminate: () => {
      // If gesture is interrupted, spring back
      if (!isDeleting.current) {
        Animated.spring(panX, {
          toValue: 0,
          useNativeDriver: true,
          friction: 8,
          tension: 100,
        }).start();
      }
    },
  }), [panX, onDelete, index]);

  const inputRange = [
    (index - 2) * TOTAL_ITEM_HEIGHT,
    index * TOTAL_ITEM_HEIGHT,
    (index + 2) * TOTAL_ITEM_HEIGHT,
  ];

  const textScale = scrollY.interpolate({
    inputRange,
    outputRange: [1, 1.57, 1],
    extrapolate: "clamp",
  });

  const opacity = scrollY.interpolate({
    inputRange,
    outputRange: [0.4, 1, 0.4],
    extrapolate: "clamp",
  });

  const textStyle = [
    styles.text,
    item.isDone && styles.doneText,
    { transform: [{ scale: textScale }] }
  ];

  if (isEditing) {
    return (
      <Animated.View
        style={[
          styles.item,
          {
            opacity,
          },
        ]}
      >
        <TextInput
          style={styles.editInput}
          value={editText}
          onChangeText={setEditText}
          onSubmitEditing={onSubmitEdit}
          onBlur={onCancelEdit}
          placeholder="Enter new item..."
          placeholderTextColor="#888"
          autoFocus
        />
      </Animated.View>
    );
  }

  return (
    <View style={styles.itemWrapper}>
      <Animated.View
        style={[
          styles.itemContainer,
          {
            transform: [{ translateX: panX }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handlePress}
          onLongPress={handleLongPress}
          delayLongPress={500}
        >
          <Animated.View
            style={[
              styles.item,
              {
                opacity,
              },
            ]}
          >
            <Animated.Text style={textStyle}>
              {item.text}
            </Animated.Text>
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export default function InertialElasticList({
  data,
  onToggleDone,
  onDelete,
  onInsert,
}: Props) {
  const scrollY = useRef(new Animated.Value(0)).current;
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [editText, setEditText] = useState("");
  const listLastTap = useRef<number>(0);
  const isSubmittingRef = useRef(false);

  const handleListDoubleTap = useCallback(() => {
    setIsAddingItem(true);
    setEditText("");
  }, []);

  const handleListPress = useCallback(() => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (listLastTap.current && now - listLastTap.current < DOUBLE_TAP_DELAY) {
      handleListDoubleTap();
      listLastTap.current = 0;
    } else {
      listLastTap.current = now;
    }
  }, [handleListDoubleTap]);

  const handleStartEdit = useCallback(() => {
    setIsAddingItem(true);
    setEditText("");
  }, []);

  const handleSubmitEdit = useCallback(() => {
    if (editText.trim()) {
      isSubmittingRef.current = true;
      if (onInsert) {
        onInsert(0, editText);
      }
      setIsAddingItem(false);
      setEditText("");
      // Reset after a tick
      setTimeout(() => {
        isSubmittingRef.current = false;
      }, 100);
    }
  }, [editText, onInsert]);

  const handleCancelEdit = useCallback(() => {
    // Don't cancel if we're in the middle of submitting
    if (isSubmittingRef.current) return;
    setIsAddingItem(false);
    setEditText("");
  }, []);

  const renderItem: FlatListProps<ListEntry>["renderItem"] = useCallback(({ item, index }: { item: ListEntry; index: number }) => {
    return (
      <ListItem
        item={item}
        index={index}
        scrollY={scrollY}
        onToggleDone={onToggleDone}
        onDelete={onDelete}
        onInsert={onInsert}
        isEditing={false}
        editText=""
        setEditText={() => {}}
        onStartEdit={handleStartEdit}
        onSubmitEdit={handleSubmitEdit}
        onCancelEdit={handleCancelEdit}
      />
    );
  }, [scrollY, onToggleDone, onDelete, onInsert, handleStartEdit, handleSubmitEdit, handleCancelEdit]);

  const keyExtractor = useCallback((item: ListEntry, index: number) => {
    return getItemKey(item, index);
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {isAddingItem && (
        <View style={styles.topInputContainer}>
          <TextInput
            style={styles.topInput}
            value={editText}
            onChangeText={setEditText}
            onSubmitEditing={handleSubmitEdit}
            onBlur={handleCancelEdit}
            placeholder="Enter new item..."
            placeholderTextColor="#888"
            autoFocus
          />
        </View>
      )}
      <TouchableOpacity
        style={{ flex: 1 }}
        activeOpacity={1}
        onPress={handleListPress}
      >
        <Animated.FlatList
          data={data}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          decelerationRate="fast"
          bounces={true}
          overScrollMode="always"
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
          scrollEventThrottle={16}
          contentContainerStyle={{
            paddingVertical: SCREEN_HEIGHT / 3,
          }}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  itemWrapper: {
    overflow: "hidden",
    marginBottom: SPACING,
  },
  itemContainer: {
    backgroundColor: "#fff",
    paddingLeft: 20,
  },
  item: {
    height: ITEM_HEIGHT,
    justifyContent: "center",
    alignItems: "flex-start",
    width: SCREEN_WIDTH - 40,
  },
  text: {
    fontSize: 14,
    color: "#222",
    fontWeight: "600",
    transformOrigin: "left center",
  },
  doneText: {
    color: "#aaa",
    textDecorationLine: "line-through",
  },
  editInput: {
    fontSize: 14,
    color: "#222",
    fontWeight: "600",
    width: "100%",
    padding: 0,
  },
  topInputContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#fff",
  },
  topInput: {
    fontSize: 16,
    color: "#222",
    fontWeight: "600",
  },
});