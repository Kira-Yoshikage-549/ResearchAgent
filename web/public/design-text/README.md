# Original entry lettering

These assets contain only selected outlined text from the three SVG design references in `例子`. They preserve the original paths, fills, transforms, and required clipping definitions. They contain no full-page background or interactive controls. `DesignText` pairs each visual with semantic HTML text; buttons, links, and the textarea remain real controls.

`manifest.json` records the source file checksum and exact lettering bounds on the 1366 × 768 reference canvas. Fixed English labels use these outlines. The empty English textarea displays the original outlined placeholder until text is entered. Translated labels and arbitrary input use local fonts because the reference contains no font binaries or complete character sets.

The original reference SVGs in `例子/` are local design files excluded from version control. Normal installation, builds, and runtime use the generated assets in this directory and do not need those references.

To regenerate, first restore the three original reference SVGs to your local `例子/` directory, then run both commands in this order from the repository root:

```powershell
python web/scripts/extract-entry-typography.py
node web/scripts/crop-entry-typography.mjs
```

The crop command expects the fresh full-canvas output from the extraction command.
