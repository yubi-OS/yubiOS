# Surface Laptop 7 (romulus) GPU firmware fix — 2026-10-05

Root cause of the boot-crash investigation's chromium halts (4/4): the Adreno X1-85
GPU's signed zap-shader microloader was MISSING — `/lib/firmware/qcom/x1e80100/microsoft/`
did not exist. Every boot logged `adreno zap_shader_load_mdt: Unable to load
qcom/x1e80100/microsoft/qcdxkmsuc8380.mbn` + `gpu hw init failed: -2` + 54
`a6xx_gmu_set_oob Timeout waiting for GMU OOB set GPU_SET` errors (the GMU is the
GPU's power-management microcontroller). Chromium (first heavy GPU user via Wayland)
storms the failing GMU path -> power-domain wedge -> instant SoC-wide halt.

## Fix

Install `qcdxkmsuc8380.mbn` (12,088 bytes, sha256
`f2f6dd1d7b2dc6e8019f85d9a17a16bb3bc3605fb0bebc632ec615c1b404b86b`) at
`/lib/firmware/qcom/x1e80100/microsoft/qcdxkmsuc8380.mbn`, mode 0644, then reboot
(the a6xx driver loads the zap shader once at probe).

## Source (proprietary — do NOT commit the blob itself)

- Driver package: WOA-Project/Qualcomm-Reference-Drivers,
  `Surface/8380_ROM_2037/200.0.47.0/qcdx8380.cab` (88,276,112 B, sha256
  `573db0aca0c857ac89658b1d63b2491c2c1369d83f7b385d27ab3ff43c08cc71`)
- Extracted with cabextract (LZX cab; pure-Python cabarchive does NOT support LZX)
- The romulus DT references ONLY this one file for the GPU (flat path, no subdir);
  ADSP/CDSP would additionally need `microsoft/Romulus/{qcadsp8380.mbn,adsp_dtbs.elf,
  qccdsp8380.mbn,cdsp_dtbs.elf}` — deliberately not installed (aDSP has known
  USB-disconnect issues on this platform)
- The zap shader is loaded by the kernel via request_firmware() at probe — NOT via
  the Qualcomm QHEE/dload handover; no cmdline entry affects the load
