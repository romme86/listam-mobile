import cv2
import numpy as np
import os

folder = 'app/assets/icons/items/example'
files = os.listdir(folder)
png_files = [f for f in files if f.endswith('.png')]

if not png_files:
    print("No PNG files found")
else:
    for f in png_files[:3]:
        path = os.path.join(folder, f)
        img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
        print(f"File: {f}")
        print(f"Shape: {img.shape}")
        if img.shape[2] == 4:
            b, g, r, a = cv2.split(img)
            unique_colors = np.unique(img.reshape(-1, 4), axis=0)
            print(f"Unique colors (RGBA): {len(unique_colors)}")
            # print some of the non-transparent colors
            non_transparent = img[a > 0]
            if len(non_transparent) > 0:
                print(f"Some non-transparent colors (BGR): {np.unique(non_transparent[:,:3], axis=0)[:5]}")
        else:
            unique_colors = np.unique(img.reshape(-1, 3), axis=0)
            print(f"Unique colors (BGR): {len(unique_colors)}")
            print(f"Some colors: {unique_colors[:5]}")
        print("-" * 20)
