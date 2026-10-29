# Video prompts — doctor mascots

Sheets: `sheets/doctora.png`, `sheets/doctor.png` (Gemini).
Start/end frames: `frames/doctora-white.png`, `frames/doctor-white.png` (background pushed to pure
white so `mix-blend-mode: multiply` makes it disappear exactly into the #fbfaf9 canvas).

## Settings (every clip)
Model: Wan (2.7 verified 2026-08-07; use 3.0 if the UI offers it AND it accepts an end frame)
First frame = last frame = the white frame · Aspect ratio 1:1 · Duration 5s · Camera: Static

## Base prompt — swap only the ACTION line
```
Starting from the provided image as the first frame. The doctor mascot ACTION, then returns to the
exact starting pose. Camera: Static, locked-off. Style: flat 2D vector animation, solid white
background throughout, smooth fluid motion, one action per shot, consistent character appearance.
```

| file | frame | ACTION |
|---|---|---|
| splash | doctora | raises one small arm and waves twice slowly, head tilting gently with the wave |
| onboarding-1 (patient) | doctora | points toward the right side and nods slowly |
| onboarding-2 (family) | doctor | places both hands on the chest and smiles, eyes closing into calm curves |
| empty | doctora | floats up and down slowly, eyes closed, resting |

## After downloading into `raw/`
```bash
for f in splash onboarding-1 onboarding-2 empty; do
  V="scale=720:-2,fps=24,curves=all='0/0 0.96/1 1/1'"   # re-whiten background drift
  ffmpeg -y -i raw/$f.mp4 -an -vf "$V" -c:v libx264 -crf 28 -preset slow -movflags +faststart -pix_fmt yuv420p $f.mp4
  ffmpeg -y -i raw/$f.mp4 -an -vf "$V" -c:v libvpx-vp9 -crf 36 -b:v 0 $f.webm
  ffmpeg -y -i $f.mp4 -frames:v 1 -q:v 3 $f.jpg
done
du -h *.mp4 *.webm   # target < 1 MB each
```

---

# Medixin redesign assets (2026-10-29)

Stills: image model with the mascot sheet attached (`sheets/doctora.png` / `sheets/doctor.png`) as the
style reference. Every still: **same flat 2D vector style, same line weight and palette as the sheet,
1:1, 1024×1024, solid pure white background (#FFFFFF), character centered, no text, no shadow on
the floor**. Save into `media/raw/` with the exact file name; I convert and wire them.

| file | reference | prompt (append to the style line above) |
|---|---|---|
| `elena-avatar.png` | doctora | head-and-shoulders portrait of the doctora mascot, warm smile, looking at the viewer, framed for a round 48px avatar |
| `patient-carlos.png` | doctora (style only) | a new character in the same style: man around 70, short grey hair, hospital gown, sitting up calmly in a hospital bed, gentle expression |
| `patient-maria.png` | doctora (style only) | a new character in the same style: woman around 50, dark hair in a low bun, hospital gown, smiling softly, sitting in an armchair |
| `patient-jorge.png` | doctora (style only) | a new character in the same style: man around 30, short dark hair, hospital gown, giving a small thumbs up |
| `family.png` | doctor (style only) | a new character in the same style: adult relative holding a phone close to the chest, relieved smile |
| `check.png` | none | glossy 3D green check mark inside a shiny green sphere, soft highlight top-left, clean product render, transparent background, centered |

Videos (same Wan workflow and post-processing as above, first frame = last frame):

| file | frame | change | ACTION |
|---|---|---|---|
| `splash-blue` | doctora | make the background solid blue **#226BEB** in the start frame first | raises one small arm and waves twice slowly, head tilting gently |
| `onboarding-nurse` | doctora | white background | holds a tablet with both hands, looks at it, then looks up and nods |
