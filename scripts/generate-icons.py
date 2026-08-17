#!/usr/bin/env python3
"""
Régénère les icônes de l'application dans public/.

Les PNG sont versionnés : ce script n'est utile que pour les refaire, par exemple
après un changement de couleur d'accent. Il n'est appelé ni au build ni au
déploiement.

    python3 -m pip install Pillow cairosvg
    python3 scripts/generate-icons.py

Le pictogramme est le cube de Phosphor Icons (licence MIT), lu depuis le paquet
@phosphor-icons/core installé en dépendance de développement — la même famille
d'icônes que celle utilisée dans l'interface, pour que l'icône de l'app et le
reste soient cohérents.
"""

import io
import re
import sys
from pathlib import Path

try:
    import cairosvg
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit('Dépendances manquantes : python3 -m pip install Pillow cairosvg')

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / 'node_modules/@phosphor-icons/core/assets/bold/cube-bold.svg'
SORTIE = RACINE / 'public'

# Doit rester aligné sur --color-accent dans src/app/globals.css (thème sombre),
# et sur theme_color dans src/app/manifest.ts.
ACCENT = (240, 118, 26, 255)

# Proportion du cube dans le carré. La version « maskable » est plus petite :
# Android rogne l'icône selon la forme du système, jusqu'à 10 % par bord.
FICHIERS = [
    ('icon-192.png', 192, 0.62),
    ('icon-512.png', 512, 0.62),
    ('icon-maskable-512.png', 512, 0.52),
    ('apple-icon.png', 180, 0.62),
]


def chemin_du_cube() -> str:
    if not SOURCE.exists():
        sys.exit(f'{SOURCE} est absent — lancez npm install au préalable.')
    correspondance = re.search(r'<path d="([^"]+)"', SOURCE.read_text(encoding='utf8'))
    if not correspondance:
        sys.exit(f'Aucun tracé trouvé dans {SOURCE}.')
    return correspondance.group(1)


def cube_blanc(tracé: str, taille: int) -> 'Image.Image':
    document = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" '
        f'width="{taille}" height="{taille}"><path d="{tracé}" fill="#ffffff"/></svg>'
    )
    rendu = cairosvg.svg2png(bytestring=document.encode())
    return Image.open(io.BytesIO(rendu)).convert('RGBA')


def icône(tracé: str, taille: int, proportion: float, maskable: bool) -> 'Image.Image':
    fond = Image.new('RGBA', (taille, taille), (0, 0, 0, 0))
    dessin = ImageDraw.Draw(fond)
    if maskable:
        dessin.rectangle([0, 0, taille, taille], fill=ACCENT)
    else:
        dessin.rounded_rectangle(
            [0, 0, taille - 1, taille - 1], radius=int(taille * 0.22), fill=ACCENT
        )

    interne = int(taille * proportion)
    # ImageDraw écrase les pixels au lieu de composer l'alpha : on superpose le
    # cube sur un calque distinct pour que ses bords restent lissés.
    calque = Image.new('RGBA', (taille, taille), (0, 0, 0, 0))
    décalage = (taille - interne) // 2
    calque.paste(cube_blanc(tracé, interne), (décalage, décalage))
    return Image.alpha_composite(fond, calque)


def main() -> None:
    tracé = chemin_du_cube()
    SORTIE.mkdir(exist_ok=True)
    for nom, taille, proportion in FICHIERS:
        maskable = 'maskable' in nom
        icône(tracé, taille, proportion, maskable).save(SORTIE / nom)
        print(f'  écrit public/{nom}  ({taille}px)')
    print('Icônes régénérées.')


if __name__ == '__main__':
    main()
