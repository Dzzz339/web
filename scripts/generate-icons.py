import os
from PIL import Image

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, '..'))
LOGO_PATH = os.path.join(ROOT_DIR, 'images', 'logo.jpg')
RES_DIR = os.path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'res')

SIZES = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192
}

def generate_icons():
    if not os.path.exists(LOGO_PATH):
        print(f"[generate-icons] Исходный логотип не найден: {LOGO_PATH}")
        return

    img = Image.open(LOGO_PATH).convert('RGBA')
    print(f"[generate-icons] Генерация Android-иконок из {LOGO_PATH}...")

    for folder, size in SIZES.items():
        target_dir = os.path.join(RES_DIR, folder)
        os.makedirs(target_dir, exist_ok=True)
        
        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        
        # ic_launcher.png
        icon_path = os.path.join(target_dir, 'ic_launcher.png')
        resized.save(icon_path, format='PNG')
        
        # ic_launcher_round.png
        round_icon_path = os.path.join(target_dir, 'ic_launcher_round.png')
        resized.save(round_icon_path, format='PNG')
        print(f" -> {folder}: {size}x{size}px сохранены")

    print("[generate-icons] Все Android-иконки успешно сгенерированы!")

if __name__ == '__main__':
    generate_icons()
