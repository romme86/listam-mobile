# Dark-mode grocery icons

The grocery icon sets ship as light-themed PNGs (dark linework on a
white/transparent ground). These scripts derive the dark-mode counterparts and
the require-map that the app swaps to when the resolved theme is dark.

## Sets

| Set | Source dir | Dark dir | Style |
|---|---|---|---|
| Items, illustrated | `app/assets/icons/items/illustrated` | `…/items/illustrated-dark` | grayscale engraving → white "chalk" sketch |
| Items, minimal | `app/assets/icons/items/minimal` | `…/items/minimal-dark` | line art → light outline |
| Letter fallback, illustrated | `app/assets/icons/letters/illustrated` | `…/letters/illustrated-dark` | ornate → light |
| Letter fallback, minimal | `app/assets/icons/letters/minimal` | `…/letters/minimal-dark` | plain → light |

Category icons are Ionicons glyphs tinted at runtime (`categoryConstants.ts`) and
need no dark assets.

## How it works

`generate-dark-assets.py` turns each icon's dark linework into an alpha mask
(`alpha = 255 − luminance`, scaled by the source alpha) and tints it light
(`#ECECEC`, ≈ `darkTheme` text). Tonal shading on the illustrated set survives in
the alpha channel, so a dark icon reads correctly on any dark surface without a
solid background.

`generate-dark-map.py` regenerates `app/components/itemIconMapDark.ts` by copying
the four light require-maps from `itemIconMap.ts` with the asset path swapped to
its `-dark` sibling. (Metro needs literal `require()` paths, so this can't be done
at runtime.)

## Regenerating

```sh
# one-time: Pillow (use a venv on externally-managed Pythons)
python3 -m venv .venv && . .venv/bin/activate && pip install pillow

python3 scripts/dark-icons/generate-dark-assets.py   # rebuild the *-dark PNGs
python3 scripts/dark-icons/generate-dark-map.py       # rebuild itemIconMapDark.ts
```

Run both after adding, removing, or restyling any light icon.
