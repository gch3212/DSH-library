"""生成市场卡片图标 assets/icon-180.png（以及 512 版）。

原 icon.svg 是 24×24 的描边图标（三本书：两本立着、一本斜着），
市场卡片只认 GitHub 托管的位图，所以按同一套几何形状重绘成 180×180 的彩色方形卡片。
"""
from PIL import Image, ImageDraw

S = 720                      # 4× 超采样，最后缩到 180
R = 40 * S / 180             # 圆角半径
OUT = S
MARGIN = 26 * S / 180

C_TOP = (58, 92, 255)        # #3A5CFF
C_BOTTOM = (124, 74, 255)    # #7C4AFF


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient_square(size):
    """对角渐变。"""
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x / size * 0.45 + y / size * 0.55)
            px[x, y] = lerp(C_TOP, C_BOTTOM, t)
    return img


def main():
    # 渐变背景 + 圆角遮罩
    bg = gradient_square(OUT)
    mask = Image.new("L", (OUT, OUT), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, OUT - 1, OUT - 1], radius=R, fill=255)

    canvas = Image.new("RGBA", (OUT, OUT), (0, 0, 0, 0))
    canvas.paste(bg, (0, 0), mask)

    glyph = Image.new("RGBA", (OUT, OUT), (0, 0, 0, 0))
    d = ImageDraw.Draw(glyph)

    # 24 单位坐标系 → 画布（留白 26/180）
    k = (OUT - MARGIN * 2) / 24.0
    ox, oy = MARGIN, MARGIN

    def p(x, y):
        return (ox + x * k, oy + y * k)

    WHITE = (255, 255, 255, 250)
    SOFT = (255, 255, 255, 215)

    # 第一本：左侧立书
    d.rounded_rectangle(
        [*p(3.6, 4.2), *p(8.8, 20.4)],
        radius=1.7 * k, fill=WHITE,
    )
    # 第二本：中间立书（略高）
    d.rounded_rectangle(
        [*p(8.8, 3.4), *p(14.6, 20.4)],
        radius=1.7 * k, fill=SOFT,
    )
    # 第三本：斜靠在中间那本上的书
    d.polygon(
        [p(15.3, 6.4), p(18.2, 5.5), p(21.1, 18.9), p(18.2, 19.8)],
        fill=SOFT,
    )

    # 书脊分隔线：在白色块之间留一道渐变色的缝，避免三本书糊成一块
    for x in (9.0,):
        d.line([p(x, 3.4), p(x, 20.6)], fill=(0, 0, 0, 0), width=max(1, int(0.5 * k)))

    canvas = Image.alpha_composite(canvas, glyph)

    out180 = canvas.resize((180, 180), Image.LANCZOS)
    out180.save("assets/icon-180.png", optimize=True)

    out512 = canvas.resize((512, 512), Image.LANCZOS)
    out512.save("assets/icon-512.png", optimize=True)

    print("wrote assets/icon-180.png", out180.size)
    print("wrote assets/icon-512.png", out512.size)


if __name__ == "__main__":
    main()
