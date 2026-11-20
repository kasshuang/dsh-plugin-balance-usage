"""Render the plugin's 180x180 storefront tile (raster, GitHub-hosted hosts only)."""
from PIL import Image, ImageDraw

S = 4  # supersample
SIZE = 180
W = SIZE * S
scale = W / 64.0

img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

blue = (47, 109, 246, 255)
white = (255, 255, 255, 255)

# rounded card
d.rounded_rectangle([0, 0, W - 1, W - 1], radius=15 * scale, fill=blue)

stroke = max(1, round(3.4 * scale))
# wallet body
d.rounded_rectangle(
    [15 * scale, 27.5 * scale, 53 * scale, 49 * scale],
    radius=5.5 * scale,
    outline=white,
    width=stroke,
)
# flap over the top-left, matching the svg arc + horizontal
d.arc(
    [15 * scale, 21 * scale, 28 * scale, 34 * scale],
    start=180,
    end=270,
    fill=white,
    width=stroke,
)
d.line([21.5 * scale, 21 * scale, 44 * scale, 21 * scale], fill=white, width=stroke)
d.line([15 * scale, 32.5 * scale, 30 * scale, 32.5 * scale], fill=white, width=stroke)
# clasp dot
d.ellipse(
    [
        (44.5 - 3) * scale,
        (39.5 - 3) * scale,
        (44.5 + 3) * scale,
        (39.5 + 3) * scale,
    ],
    fill=white,
)

img.resize((SIZE, SIZE), Image.LANCZOS).save(r"E:\dsh\publish\balance-usage\assets\icon-180.png", optimize=True)
print("written")
