import React, { useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  StyleSheet,
  FlatListProps,
  TouchableOpacity,
  TextInput,
  PanResponder,
} from "react-native";
import type { ListEntry } from "../index";

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");
const ITEM_HEIGHT = 60;
const SPACING = 16;
const TOTAL_ITEM_HEIGHT = ITEM_HEIGHT + SPACING;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;

type Props = {
  data: ListEntry[];
  onToggleDone?: (index: number) => void;
  onDelete?: (index: number) => void;
  onUpdate?: (index: number, text: string) => void;
  onInsert?: (index: number, text: string) => void;
};

export default function InertialElasticList({ 
  data, 
  onToggleDone,
  onDelete,
  onUpdate,
  onInsert,
}: Props) {
  const scrollY = useRef(new Animated.Value(0)).current;
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  const panXRef = useRef<{ [key: number]: Animated.Value }>({});
  const lastTapRef = useRef<{ [key: number]: number }>({});
  const listLastTap = useRef<number>(0);

  const handleSingleTap = (index: number) => {
    if (onToggleDone) {
      onToggleDone(index);
    }
  };

  const handleDoubleTap = (index: number) => {
    // Add new entry at the focused position
    if (onInsert) {
      setEditingIndex(index);
      setEditText("");
    }
  };

  const handleListDoubleTap = () => {
    // Add new entry at the top (index 0)
    setEditingIndex(0);
    setEditText("");
  };

  const handleListPress = () => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (listLastTap.current && now - listLastTap.current < DOUBLE_TAP_DELAY) {
      handleListDoubleTap();
      listLastTap.current = 0;
    } else {
      listLastTap.current = now;
    }
  };

  const handleLongPress = (index: number) => {
    if (onToggleDone) {
      onToggleDone(index);
    }
  };

  const handlePress = (index: number) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (lastTapRef.current[index] && now - lastTapRef.current[index] < DOUBLE_TAP_DELAY) {
      handleDoubleTap(index);
      lastTapRef.current[index] = 0;
    } else {
      lastTapRef.current[index] = now;
      setTimeout(() => {
        if (lastTapRef.current[index] === now) {
          handleSingleTap(index);
        }
      }, DOUBLE_TAP_DELAY);
    }
  };

  const handleSubmitEdit = () => {
    if (editingIndex !== null && editText.trim()) {
      if (onInsert) {
        onInsert(editingIndex, editText);
      }
      setEditingIndex(null);
      setEditText("");
    }
  };

  const renderItem: FlatListProps<ListEntry>["renderItem"] = ({ item, index }) => {
    if (!panXRef.current[index]) {
      panXRef.current[index] = new Animated.Value(0);
    }

    const panX = panXRef.current[index];

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

    const panResponder = PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 10;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx < 0) {
          panX.setValue(gestureState.dx);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -SWIPE_THRESHOLD) {
          Animated.timing(panX, {
            toValue: -SCREEN_WIDTH,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            if (onDelete) {
              onDelete(index);
            }
            panX.setValue(0);
          });
        } else {
          Animated.spring(panX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    });

    const textStyle = [
      styles.text,
      item.isDone && styles.doneText,
      { transform: [{ scale: textScale }] }
    ];

    if (editingIndex === index) {
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
            onSubmitEditing={handleSubmitEdit}
            onBlur={() => setEditingIndex(null)}
            placeholder="Enter new item..."
            autoFocus
          />
        </Animated.View>
      );
    }

    return (
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
          onPress={() => handlePress(index)}
          onLongPress={() => handleLongPress(index)}
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
    );
  };

  return (
    <TouchableOpacity 
      style={{ flex: 1 }} 
      activeOpacity={1}
      onPress={handleListPress}
    >
      <Animated.FlatList
        data={data}
        keyExtractor={(_, index) => index.toString()}
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
  );
}

const styles = StyleSheet.create({
  itemContainer: {
    marginBottom: SPACING,
  },
  item: {
    height: ITEM_HEIGHT,
    justifyContent: "center",
    alignItems: "flex-start",
    paddingLeft: 20,
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
});