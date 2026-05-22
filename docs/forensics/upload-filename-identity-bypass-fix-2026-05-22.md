# Upload Filename Identity Bypass Fix (2026-05-22)

## Real Root Cause
The frontend Upload flow generated an internal accepted CSV file and posted that transformed filename to `/api/upload`.

Example:
- Original client file: `LCS 17-13-11-2024.xls`
- Transformed upload file: `LCS 17-13-11-2024-accepted.csv`

Backend duplicate identity and exemption matching correctly used `uploadedFile.originalname`, so comparison happened against the transformed filename instead of the original client filename listed in Allow Test File Names.

## Frontend Filename Rewrite Explanation
In Upload flow, accepted rows are serialized into a new File object with `-accepted.csv` suffix for transport. This is valid for payload content, but it must not become the duplicate identity key.

## Final Permanent Fix
- Frontend now sends `sourceOriginalFilename` in FormData using the original selected filename.
- Backend now prioritizes `sourceOriginalFilename` as duplicate identity key.
- Backend falls back to `uploadedFile.originalname` if `sourceOriginalFilename` is absent.
- Duplicate normalization, exemption compare, and persisted `labelJob.originalFilename` all use this final identity key.

## Forensic Markers Added
- `SOURCE_FILENAME_RECEIVED`
- `SOURCE_FILENAME_NORMALIZED`
- `FINAL_DUPLICATE_IDENTITY`

## Expected Runtime Result
If `LCS 17-13-11-2024.xls` exists in Allow Test File Names, bypass now applies even when payload file is transformed to `-accepted.csv`.
