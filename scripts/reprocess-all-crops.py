import os
import sys
from PIL import Image
import numpy as np
from collections import deque

CROP_SOURCES = {
    # Fruits
    ('Fruits', 'mangga.png'): r'C:\Users\User\.gemini\antigravity\brain\3b584165-850e-457c-9e01-24819400a896\mangga_weather_art_1790487146290.jpg',
    ('Fruits', 'saging.png'): r'C:\Users\User\.gemini\antigravity\brain\3b584165-850e-457c-9e01-24819400a896\saging_weather_art_1790487179378.jpg',
    # Vegetables
    ('Vegetables', 'ampalaya.png'): r'C:\Users\User\.gemini\antigravity\brain\55ccf37b-7d7b-4493-958d-59936f407ef2\ampalaya_clean_white_1790486975341.jpg',
    ('Vegetables', 'talong.png'): r'C:\Users\User\.gemini\antigravity\brain\34bf56a0-3948-408a-a52b-e67f756cfb96\talong_weather_art_1790487148036.jpg',
    ('Vegetables', 'kalabasa.png'): r'C:\Users\User\.gemini\antigravity\brain\34bf56a0-3948-408a-a52b-e67f756cfb96\kalabasa_weather_art_1790487176458.jpg',
    ('Vegetables', 'kamatis.png'): r'C:\Users\User\.gemini\antigravity\brain\55ccf37b-7d7b-4493-958d-59936f407ef2\kamatis_tomato_1790507163889.jpg',
    ('Vegetables', 'sitaw.png'): r'C:\Users\User\.gemini\antigravity\brain\55ccf37b-7d7b-4493-958d-59936f407ef2\sitaw_yardlong_bean_1790507239878.jpg',
    ('Vegetables', 'okra.png'): r'C:\Users\User\.gemini\antigravity\brain\55ccf37b-7d7b-4493-958d-59936f407ef2\okra_lady_finger_1790507294632.jpg',
    # Leafy Greens
    ('LeafyGreens', 'pechay.png'): r'C:\Users\User\.gemini\antigravity\brain\ea5f4c10-e3c0-4617-9263-b1edd68264b1\pechay_bok_choy_1790507359287.jpg',
    ('LeafyGreens', 'kangkong.png'): r'C:\Users\User\.gemini\antigravity\brain\ea5f4c10-e3c0-4617-9263-b1edd68264b1\kangkong_plant_1790507439434.jpg',
    ('LeafyGreens', 'malunggay.png'): r'C:\Users\User\.gemini\antigravity\brain\ea5f4c10-e3c0-4617-9263-b1edd68264b1\malunggay_moringa_1790507521891.jpg',
    ('LeafyGreens', 'mustasa.png'): r'C:\Users\User\.gemini\antigravity\brain\ea5f4c10-e3c0-4617-9263-b1edd68264b1\mustasa_greens_1790507614404.jpg',
    ('LeafyGreens', 'saluyot.png'): r'C:\Users\User\.gemini\antigravity\brain\ea5f4c10-e3c0-4617-9263-b1edd68264b1\saluyot_leaves_1790507662604.jpg',
    # Root Crops
    ('RootCrops', 'kamote.png'): r'C:\Users\User\.gemini\antigravity\brain\55ccf37b-7d7b-4493-958d-59936f407ef2\kamote_sweet_potato_1790507358093.jpg',
    ('RootCrops', 'kamoteng_kahoy.png'): r'C:\Users\User\.gemini\antigravity\brain\55ccf37b-7d7b-4493-958d-59936f407ef2\cassava_root_1790507405786.jpg',
    # Grains
    ('Grains', 'palay.png'): r'C:\Users\User\.gemini\antigravity\brain\50a5c392-3c01-4154-8137-5f8949466121\palay_illustration_1790509689163.jpg',
    # Spices
    ('Spices', 'bawang.png'): r'C:\Users\User\.gemini\antigravity\brain\55ccf37b-7d7b-4493-958d-59936f407ef2\garlic_bawang_1790507650746.jpg',
    ('Spices', 'siling_haba.png'): r'C:\Users\User\.gemini\antigravity\brain\b6d0d1e3-da81-4400-b0d8-2a6dd9eaa619\siling_haba_weather_art_1790487171369.jpg',
    ('Spices', 'siling_labuyo.png'): r'C:\Users\User\.gemini\antigravity\brain\b6d0d1e3-da81-4400-b0d8-2a6dd9eaa619\siling_labuyo_weather_art_1790487140038.jpg',
}

def clean_and_rescale(input_path, target_output):
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
                    
    # 2. Interior white cavities / loops (between vines, stalks, stems)
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
                
                # Check if this is an enclosed white background patch
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
        
    os.makedirs(os.path.dirname(target_output), exist_ok=True)
    final_img.save(target_output, 'PNG')
    
    # Calculate stats
    out_arr = np.array(final_img)
    white_op = (out_arr[:,:,3] > 50) & (out_arr[:,:,0] > 220) & (out_arr[:,:,1] > 220) & (out_arr[:,:,2] > 220)
    pct = 100 * white_op.sum() / max(1, (out_arr[:,:,3] > 50).sum())
    print(f"Processed {os.path.basename(target_output):18s} -> Subject: {nw}x{nh}px, White remnants: {pct:.2f}%")

if __name__ == '__main__':
    base_out = r'c:\Users\User\Desktop\MobileDev\AgriGrow\assets\Almanac'
    for (cat, filename), src_path in CROP_SOURCES.items():
        out_path = os.path.join(base_out, cat, filename)
        clean_and_rescale(src_path, out_path)
    print("\n[SUCCESS] All 19 crops reprocessed with clean transparency and unified bold scale!")
