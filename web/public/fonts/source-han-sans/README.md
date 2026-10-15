# Source Han Sans CN · 思源黑体

These retained Source Han Sans regular (400) and bold (700) files are legacy
assets. The active Chinese UI uses Chiron Hei HK from Fontsource; Latin text
continues to use Inter.

Source: Adobe's official [Source Han Sans repository](https://github.com/adobe-fonts/source-han-sans),
release branch, `SubsetOTF/CN/SourceHanSansCN-Regular.otf` and
`SourceHanSansCN-Bold.otf`, version 2.005. Retrieved 2026-10-09.

The complete Simplified Chinese character coverage is preserved. Only the
container format and internal family names change; glyph designs are unchanged.
The WOFF2 derivative is named **Research Agent Han** to respect Adobe's reserved
font name **Source**. The upstream SIL Open Font License accompanies the files
in `LICENSE.txt`.

Reproduce from the official OTF files and license:

```powershell
python -m pip install fonttools brotli
python web/scripts/build-chinese-fonts.py --source-dir <official-font-directory>
```

Both faces are self-hosted, use `font-display: swap`, and load only when text
needs this family. No external font request is made at runtime.
