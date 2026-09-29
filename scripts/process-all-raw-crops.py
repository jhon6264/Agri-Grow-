import os
import sys
from PIL import Image
import numpy as np
from collections import deque

RAW_DIR = 'assets/Almanac/raw'
OUTPUT_BASE = 'assets/Almanac'

RAW_MAPPINGS = {
    # Fruits (6)
    'Bayabas.jpg': ('Fruits', 'bayabas.png'),
    'Guyabano.jpg': ('Fruits', 'guyabano.png'),
    'Kalamansi.jpg': ('Fruits', 'calamansi.png'),
    'Pakwan.jpg': ('Fruits', 'pakwan.png'),
    'Papaya.jpg': ('Fruits', 'papaya.png'),
    'Pinya.jpg': ('Fruits', 'pinya.png'),
    # Vegetables (6)
    'Kamatis.jpg': ('Vegetables', 'kamatis.png'),
    'Okra.jpg': ('Vegetables', 'okra.png'),
    'Patola.jpg': ('Vegetables', 'patola.png'),
    'Sigarilyas.jpg': ('Vegetables', 'sigarilyas.png'),
    'Sitaw.jpg': ('Vegetables', 'sitaw.png'),
    'Upo.jpg': ('Vegetables', 'upo.png'),
    # Leafy Greens (6)
    'Kangkong.jpg': ('LeafyGreens', 'kangkong.png'),
    'Kulitis.jpg': ('LeafyGreens', 'kulitis.png'),
    'Malunggay.jpg': ('LeafyGreens', 'malunggay.png'),
    'Mustasa.jpg': ('LeafyGreens', 'mustasa.png'),
    'Pechay.jpg': ('LeafyGreens', 'pechay.png'),
    'Saluyot.jpg': ('LeafyGreens', 'saluyot.png'),
    # Root Crops (4)
    'Gabi.jpg': ('RootCrops', 'gabi.png'),
    'Kamote.jpg': ('RootCrops', 'kamote.png'),
    'Kamoteng Kahoy.jpg': ('RootCrops', 'kamoteng_kahoy.png'),
    'Ube.jpg': ('RootCrops', 'ube.png'),
    # Grains (2)
    'Mais.jpg': ('Grains', 'mais.png'),
    'Palay.jpg': ('Grains', 'palay.png'),
    # Spices (4)
    'Garlic.jpg': ('Spices', 'bawang.png'),
    'Luya.jpg': ('Spices', 'luya.png'),
    'Sibuyas.jpg': ('Spices', 'sibuyas.png'),
    'Tanglad.jpg': ('Spices', 'tanglad.png'),
}

def process_crop(raw_filename, folder, out_filename):
    input_path = os.path.join(RAW_DIR, raw_filename)
    output_path = os.path.join(OUTPUT_BASE, folder, out_filename)
    
    if not os.path.exists(input_path):
        print(f"ERROR: Missing input file: {input_path}")
        return False
        
    img = Image.open(input_path).convert('RGB')
    arr = np.array(img, dtype=np.float32)
    h, w = arr.shape[:2]
    
    r, g, b = arr[:,:,0], arr[:,:,1], arr[:,:,2]
    brightness = (r + g + b) / 3.0
    saturation = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    
    is_bg = np.zeros((h, w), dtype=bool)
    visited = np.zeros((h, w), dtype=bool)
    
    # 1. Outer flood fill from all borders
    q = deque()
    for x in range(w):
        for y in [0, h - 1]:
            if brightness[y, x] > 218 and saturation[y, x] < 38:
                q.append((x, y))
                visited[y, x] = True
                is_bg[y, x] = True
    for y in range(h):
        for x in [0, w - 1]:
            if not visited[y, x] and brightness[y, x] > 218 and saturation[y, x] < 38:
                q.append((x, y))
                visited[y, x] = True
                is_bg[y, x] = True
                
    while q:
        cx, cy = q.popleft()
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny, nx]:
                if brightness[ny, nx] > 218 and saturation[ny, nx] < 38:
                    visited[ny, nx] = True
                    is_bg[ny, nx] = True
                    q.append((nx, ny))
                    
    # 2. Interior white cavities / loops (between vines, stems, leaves)
    cand = (~visited) & (brightness > 230) & (saturation < 18)
    cand_visited = np.zeros((h, w), dtype=bool)
    
    for y in range(h):
        for x in range(w):
            if cand[y, x] and not cand_visited[y, x]:
                pocket = []
                pq = deque([(x, y)])
                cand_visited[y, x] = True
                
                while pq:
                    px, py = pq.popleft()
                    pocket.append((px, py))
                    for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                        nx, ny = px + dx, py + dy
                        if 0 <= nx < w and 0 <= ny < h and cand[ny, nx] and not cand_visited[ny, nx]:
                            cand_visited[ny, nx] = True
                            pq.append((nx, ny))
                
                pocket_b = [brightness[py, px] for px, py in pocket]
                pocket_s = [saturation[py, px] for px, py in pocket]
                if np.mean(pocket_b) > 233 and np.mean(pocket_s) < 15:
                    for px, py in pocket:
                        is_bg[py, px] = True
                        
    # 3. Alpha channel with soft edge feathering
    alpha = np.where(is_bg, 0.0, 255.0).astype(np.float32)
    near_bg = (~is_bg) & (brightness > 215) & (saturation < 30)
    alpha[near_bg] = np.clip((230.0 - brightness[near_bg]) / 15.0 * 255.0, 0, 255)
    
    rgba = np.dstack([arr[:,:,0], arr[:,:,1], arr[:,:,2], alpha]).astype(np.uint8)
    res = Image.fromarray(rgba, 'RGBA')
    
    # 4. Auto-crop to bounding box & center in 1024x1024 with 920px max dimension
    opaque = alpha > 25
    if opaque.any():
        ys, xs = np.where(opaque)
        cropped = res.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
        cw, ch = cropped.size
        scale = 920.0 / max(cw, ch)
        nw, nh = int(round(cw * scale)), int(round(ch * scale))
        resized = cropped.resize((nw, nh), Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
        canvas.paste(resized, ((1024 - nw) // 2, (1024 - nh) // 2), resized)
        final_img = canvas
    else:
        final_img = res

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    final_img.save(output_path, 'PNG', optimize=True)
    print(f"OK: {raw_filename:20s} -> {os.path.join(folder, out_filename):30s} (scale=920px)")
    return True

if __name__ == '__main__':
    print(f"Processing {len(RAW_MAPPINGS)} raw crop illustrations...")
    success = 0
    for raw_f, (folder, out_f) in RAW_MAPPINGS.items():
        if process_crop(raw_f, folder, out_f):
            success += 1
    print(f"\nCompleted: {success}/{len(RAW_MAPPINGS)} crops successfully converted to transparent PNGs!")
