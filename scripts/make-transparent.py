import sys
from PIL import Image
import numpy as np
from collections import deque

def make_transparent(input_path, output_paths):
    img = Image.open(input_path).convert('RGBA')
    data = np.array(img)
    h, w = data.shape[:2]
    visited = np.zeros((h, w), dtype=bool)
    q = deque()

    # Seed with outer white pixels
    for x in range(w):
        for y in [0, h - 1]:
            if (data[y, x, :3] > 238).all():
                q.append((x, y))
                visited[y, x] = True
    for y in range(h):
        for x in [0, w - 1]:
            if not visited[y, x] and (data[y, x, :3] > 238).all():
                q.append((x, y))
                visited[y, x] = True

    while q:
        x, y = q.popleft()
        data[y, x, 3] = 0  # transparent
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny, nx]:
                if (data[ny, nx, :3] > 230).all():
                    visited[ny, nx] = True
                    q.append((nx, ny))

    result = Image.fromarray(data)
    for out in output_paths:
        result.save(out, 'PNG')
    print(f"Saved transparent PNG to {output_paths}")

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python make-transparent.py <input_jpg> <output_png1> [output_png2...]")
        sys.exit(1)
    make_transparent(sys.argv[1], sys.argv[2:])
