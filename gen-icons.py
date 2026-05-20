"""Generate minimal PNG icons using only Python stdlib."""
import struct, zlib

def png(width, height, rgba_rows):
    def chunk(name, data):
        c = name + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)

    raw = b''
    for row in rgba_rows:
        raw += b'\x00' + bytes(row)

    compressed = zlib.compress(raw, 9)
    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
        + chunk(b'IDAT', compressed)
        + chunk(b'IEND', b'')
    )

def make_icon(size):
    bg   = (10,  10,  20)
    surf = (19,  19,  31)
    acc  = (86,  206, 242)

    pixels = [[bg] * size for _ in range(size)]

    def set_pixel(x, y, color):
        if 0 <= x < size and 0 <= y < size:
            pixels[y][x] = color

    def fill_rect(x1, y1, x2, y2, color):
        for y in range(max(0,y1), min(size,y2+1)):
            for x in range(max(0,x1), min(size,x2+1)):
                pixels[y][x] = color

    def draw_line(x1, y1, x2, y2, color, thickness=1):
        if x1 == x2:
            for y in range(min(y1,y2), max(y1,y2)+1):
                for dx in range(-(thickness//2), thickness//2+1):
                    set_pixel(x1+dx, y, color)
        elif y1 == y2:
            for x in range(min(x1,x2), max(x1,x2)+1):
                for dy in range(-(thickness//2), thickness//2+1):
                    set_pixel(x, y1+dy, color)

    s = size / 512

    # Screen background
    sx1, sy1 = int(72*s), int(120*s)
    sx2, sy2 = int((72+368)*s), int((120+236)*s)
    fill_rect(sx1, sy1, sx2, sy2, surf)
    # Screen border
    t = max(1, int(5*s))
    fill_rect(sx1, sy1, sx2, sy1+t, acc)
    fill_rect(sx1, sy2-t, sx2, sy2, acc)
    fill_rect(sx1, sy1, sx1+t, sy2, acc)
    fill_rect(sx2-t, sy1, sx2, sy2, acc)

    # Text lines
    th = max(1, int(7*s))
    lines = [
        (int(116*s), int(188*s), int(396*s), int(188*s), acc),
        (int(116*s), int(228*s), int(396*s), int(228*s), tuple(int(c*0.55) for c in acc)),
        (int(116*s), int(268*s), int(396*s), int(268*s), tuple(int(c*0.55) for c in acc)),
        (int(116*s), int(308*s), int(280*s), int(308*s), tuple(int(c*0.55) for c in acc)),
    ]
    for x1, y1, x2, y2, color in lines:
        draw_line(x1, y1, x2, y2, color, th)

    # Stand neck
    nx1, ny1 = int(240*s), int(356*s)
    nx2, ny2 = int((240+32)*s), int((356+52)*s)
    fill_rect(nx1, ny1, nx2, ny2, acc)

    # Stand base
    bx1, by1 = int(180*s), int(400*s)
    bx2, by2 = int((180+152)*s), int((400+24)*s)
    fill_rect(bx1, by1, bx2, by2, acc)

    rows = [list(sum(row, ())) for row in pixels]
    return png(size, size, rows)

for sz, name in [(192, 'icon-192.png'), (512, 'icon-512.png')]:
    data = make_icon(sz)
    with open(name, 'wb') as f:
        f.write(data)
    print(f'Written {name} ({len(data)} bytes)')
