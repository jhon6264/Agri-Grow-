# Historical layered implementation — superseded

See calendar-whole-generation.md for the active complete-character animation.

# Calendar corner mascot

## Current layered animation

`calendar-peek-parts.png` is the active transparent 1254 × 1254 asset, created with **built-in ImageGen** from the user's `ChatGPT Image Sep 27, 2026, 08_11_22 PM.png` reference. Selected output: `exec-4aa79ccf-bae8-46e0-a698-537601b451e2.png`.

The runtime uses one fixed body, a gripping forearm, an open waving forearm, and small closed-eye patches. It does not play full-body frames. `calendar-peek-rig.ts` registers the irregularly packed parts into a shared coordinate system; the generated layout was not an exact grid. SVG clipping selects parts without modifying the source PNG. The same fixed body and hat remain visible for the entire loop. Only one forearm is visible at a time, rotating around a fixed elbow. The hand releases, opens, waves twice, closes, and returns to its grip. Blinks last 340ms including transitions, with a 160ms fully closed hold, and occur both at rest and while waving.

`CalendarCornerMascot.tsx` uses Reanimated for arm rotation and eye opacity. Reduced motion, an inactive screen, and backgrounding reset it to the static gripping pose. `calendar-corner-layout.ts` reserves the full portrait height, including the rounded elbow, and places the body's vertical right boundary at the screen edge. The overlay does not intercept touches. Profile navigation remains a future feature.

The older `calendar-corner-farmer.png` and `calendar-corner-timing.ts` are superseded and are not imported by the app.

## Final generation prompt

> Create a production cutout animation asset pack based EXACTLY on the attached AgriGrow farmer peeking from a vertical right edge. True alpha transparency, no background, no checkerboard, no labels. ONE 2 columns by 2 rows sheet of FOUR EQUAL SQUARE CELLS. Each cell represents the SAME full character coordinate system at the SAME scale and position. Fit the character large within cell, hat top at 6%, leftmost hat at 8%, right vertical occlusion edge at 91%, rounded elbow bottom at 94%. Preserve the reference's complete long torso, rounded sleeve and elbow, tilted head, hat, green overalls, face, smile. TOP LEFT cell: fixed base character, identical reference but REMOVE ONLY skin forearm and gripping hand; reconstruct green overalls behind removed forearm; retain full upper arm white rolled sleeve and round elbow cuff so a detachable forearm can attach at bottom right. No hands visible on base. TOP RIGHT cell: ONLY the detached skin forearm and CLOSED GRIPPING HAND from reference, situated in exactly the same position and size as on the character, with all other pixels transparent. Rounded elbow attachment at approximately x78%,y88%, gripping knuckles near x91%,y65%. BOTTOM LEFT cell: ONLY that SAME skin forearm, same position and length, but fingers now open into a friendly spread-finger waving palm. Elbow in exactly the same position as top-right cell; wrist same position; the fingers extend upward; keep fingertips inside the cell. No second arm and no sleeve on either detachable forearm. BOTTOM RIGHT cell: identical top-left base character, SAME head/body position and size, but BOTH EYES gently fully CLOSED in happy curved eyelid shapes. Everything else identical. These are layered parts, NOT sequential frames. Clean smooth alpha edges, no colored fringe. Do not shorten torso or elbow or crop at bottom. Maintain all four cell coordinate systems precisely.

## Verification

Follow-up corrections: the mascot now renders at 85% of the previous responsive size. The forearm rotates inside the shared SVG, preventing an intermediate arm viewport from trimming fingers. Both hand poses attach at the same sleeve pivot and use an 88% arm scale. The sleeve's front lip renders over the joint. The palm opens only once the arm is at least 26 degrees inward and closes before returning to the edge. An alpha-pixel clearance check across the complete open-hand angle range (-26 to -54 degrees) found at least 19.55 source pixels of right-edge clearance for pixels with alpha >= 32.

The browser layout preview uses the production PNG and motion function at 320px and 390px widths, plus an enlarged view for joint/eye inspection. This is a visual approximation, not a native phone capture. Device playback still needs checking in the app.

## Sleeve and wrist correction

The active elbow patch comes from `calendar-elbow-repair.png`, generated with built-in ImageGen from `calendar-peek-parts.png` (output `exec-e17663f8-7ca6-4f27-8486-d128c7a0fec5.png`). Only a small sleeve region is composited; the existing face, body, and other parts stay fixed. The sleeve opening now contains skin, and a foreground patch blends over the forearm's rounded cutout edge. The open hand has its own wrist pivot, 18-degree side-to-side motion and perspective foreshortening equivalent to a 55-degree partial palm turn. This is a partial turn, not an illustrated back-of-hand pose. The forearm moves only slightly during the wave. The 15% overall size reduction remains.

Repair prompt:

> Precise small-region correction to this existing transparent sprite-parts sheet. Preserve exact canvas size and ALL artwork positions, colors, scale and shapes. Edit ONLY the circular white closed sleeve end on the TOP LEFT character, near pixel x570 y630 on the 1254x1254 image. The rolled shirt cuff must have a real opening with a short warm skin-colored elbow emerging through it, not a white fabric disk. Replace the inner white disk with skin matching the detached forearm, with natural shadow where skin meets the cloth. Preserve the outer rolled white cuff rim and complete rounded sleeve silhouette. The skin should fill the oval cuff opening and overlap into a short forearm stump angled upward-right, extending about 25 pixels above the cuff. Keep the torso, face, hat and ALL other parts absolutely unchanged, including both detached arms and the lower-right face. No text, no background, no added shapes outside that one sleeve opening. True alpha transparency. This is an elbow-to-sleeve join repair, not a redesign.

