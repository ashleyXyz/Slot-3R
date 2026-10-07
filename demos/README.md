# Interactive scene demos

This directory contains 24 scenes: 16 RGB sequences and eight static reconstructions. `home_11630727` is excluded. Courtyard uses VPC-M with 60% of finite-confidence candidates retained before border masking and sampling (q40). Arcade uses Core with 85% retained (q15). These replace the mistakenly over-filtered q75/q60 exports. Other RGB scenes retain their existing thresholds.

The RGB image sequences and frame-preserving point samples match the local viewer. Binary records are little-endian float32 XYZ followed by uint8 RGB (15 bytes). Each metadata frame contains its end offset, observation timestamp, and matching camera-to-world pose. At replay end all preview points are shown. This is replay of saved final geometry; it does not measure inference speed. Both VPC variants use final corrected poses.

Only the selected scene's point cloud and RGB observations load; thumbnails are lazy loaded. Earlier full PLYs and input clips are archived in Google Drive; the latest confidence-filtered PLYs are delivered separately to the local video_test folder. The embedded viewer is isolated by an iframe; all runtime dependencies are vendored, including the Three.js license. Source links are present for every RGB sequence.

Open this directory directly, or use `?embed=1` inside the project page. Serve over HTTP(S); no build step required.

Alley uses `alley_11339296_vpc_a.ply` (135 frames). Arcade uses `arcade_37340388_t6_core_q15_more.ply` (172 frames, 1,799,980 points), paired with the continuous source interval from 6 seconds to the end. Courtyard uses `courtyard_34502981_vpc_m_q40_more.ply` (255 frames, 2,249,865 points). These previews use every fifth point within each exported frame block, with unmodified positions and colors. Camera poses are from the matching model run.

The first October 7 confidence exports required new inference runs. Each has a private same-run control at its original threshold; old-versus-new geometry differences must not be attributed solely to confidence filtering. The corrected denser exports reuse those cached predictions and poses without another inference run. Every point of the same-run q50 Courtyard / q25 Arcade control is preserved exactly, then additional points are sampled from the expanded confidence mask. Per-frame budgets sum to approximately 2.25 million and 1.8 million points respectively; border masking remains three pixels. Web previews increase to approximately 450k and 360k points. Scene metadata records PLY hashes and provenance. Model memory settings are unchanged.

Thumbnail and initial interactive camera projections share `assets/results/thumbnail-views.json`. The viewer preserves thumbnail angle and framing across viewport sizes; Reset view returns to that scene's preview view. Thumbnail rendering changes only camera framing, not input geometry or colors.

Backyard 02 uses `backyard_7578555_core_nosky_clean.ply` (108 frames, 1,178,951 points). This Core result has conservative semantic sky filtering and the sparsest 10% removed using mean distance to 16 neighbors. Surviving XYZ/RGB are unchanged. Variable frame counts are recovered exactly from saved masks; the preview retains every fourth surviving point per frame.
